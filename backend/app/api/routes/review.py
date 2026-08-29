"""Human review of low-confidence extractions (FR-3, FR-5, FR-10).

Fields whose confidence fell below the threshold land here. An officer confirms,
corrects, or rejects each one; the change is written to the audit trail with the
before/after value, and the parent document's status is recomputed.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_db, resolve_actor_id
from app.audit import record_event
from app.models import Document, DocumentStatus, ExtractionField, FieldStatus
from app.schemas.review import (
    ReviewAction,
    ReviewQueueItem,
    ReviewQueueResponse,
    ReviewResult,
)

router = APIRouter(tags=["review"])


@router.get("/queue", response_model=ReviewQueueResponse)
def review_queue(
    subsidiary_id: uuid.UUID | None = None,
    doc_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> ReviewQueueResponse:
    q = (
        select(ExtractionField, Document)
        .join(Document, ExtractionField.document_id == Document.id)
        .where(ExtractionField.status == FieldStatus.needs_review)
    )
    if subsidiary_id is not None:
        q = q.where(Document.subsidiary_id == subsidiary_id)
    if doc_type is not None:
        q = q.where(Document.doc_type == doc_type)

    total = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(
        q.order_by(ExtractionField.confidence.asc()).limit(min(limit, 300)).offset(offset)
    ).all()

    items = [
        ReviewQueueItem(
            id=f.id,
            document_id=d.id,
            document_filename=d.original_filename,
            doc_type=d.doc_type,
            field_key=f.field_key,
            label=f.label,
            value_text=f.value_text,
            value_json=f.value_json,
            entity_type=f.entity_type,
            source_kind=f.source_kind,
            page_no=f.page_no,
            bbox=f.bbox,
            source_snippet=f.source_snippet,
            confidence=f.confidence,
            review_note=f.review_note,
            status=f.status,
        )
        for f, d in rows
    ]
    return ReviewQueueResponse(items=items, total=total)


def _recompute_document_status(db: Session, doc: Document) -> None:
    remaining = db.execute(
        select(func.count())
        .select_from(ExtractionField)
        .where(
            ExtractionField.document_id == doc.id,
            ExtractionField.status == FieldStatus.needs_review,
        )
    ).scalar_one()
    total = db.execute(
        select(func.count()).select_from(ExtractionField).where(
            ExtractionField.document_id == doc.id
        )
    ).scalar_one()
    if total == 0:
        doc.status = DocumentStatus.extracted
    elif remaining == 0:
        doc.status = DocumentStatus.ready
    else:
        doc.status = DocumentStatus.needs_review


@router.post("/fields/{field_id}", response_model=ReviewResult)
def review_field(
    field_id: uuid.UUID,
    action: ReviewAction,
    db: Session = Depends(get_db),
    actor: str = Depends(get_actor),
) -> ReviewResult:
    field = db.get(ExtractionField, field_id)
    if field is None:
        raise HTTPException(404, "field not found")
    if field.status not in (FieldStatus.needs_review, FieldStatus.auto_accepted):
        raise HTTPException(409, f"field already {field.status}")

    before = field.value_text
    if action.action == "confirm":
        field.status = FieldStatus.verified
    elif action.action == "reject":
        field.status = FieldStatus.rejected
    elif action.action == "correct":
        if not action.value_text or not action.value_text.strip():
            raise HTTPException(422, "value_text is required for a correction")
        if not field.original_value_text:
            field.original_value_text = field.value_text
        field.value_text = action.value_text.strip()
        field.status = FieldStatus.verified

    field.review_note = action.note or field.review_note
    field.reviewed_at = datetime.now(UTC)
    field.reviewed_by_id = resolve_actor_id(db, actor)
    db.flush()  # SessionLocal has autoflush=False; make the new status visible to the count below

    doc = db.get(Document, field.document_id)
    _recompute_document_status(db, doc)

    record_event(
        db, actor=actor, action=f"field.{action.action}",
        target_type="extraction_field", target_id=str(field.id),
        meta={
            "document_id": str(field.document_id),
            "field_key": field.field_key,
            "before": before,
            "after": field.value_text,
            "resulting_status": field.status,
            "note": action.note,
        },
    )
    db.commit()

    # M2: a verified / corrected / rejected field changes which facts are "accepted",
    # so rebuild this document's graph (text is unchanged -> no re-embedding).
    try:
        from app.services.knowledge import build_knowledge

        build_knowledge(field.document_id, db=db, reindex=False, actor=actor)
        db.commit()
    except Exception:  # noqa: BLE001 — the review itself already succeeded
        db.rollback()

    return ReviewResult(
        id=field.id,
        status=field.status,
        value_text=field.value_text,
        document_id=field.document_id,
        document_status=doc.status,
        reviewed_at=field.reviewed_at,
    )
