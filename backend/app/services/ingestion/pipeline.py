"""The ingestion → extraction pipeline for one document.

`run_pipeline(document_id)` is self-contained (opens its own DB session) so it can
run from a FastAPI BackgroundTask, a CLI, or later a queue worker without change.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.audit import record_event
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.models import Document, DocumentStatus, ExtractionField, FieldStatus
from app.services.extraction import extract_fields
from app.services.ingestion.classifier import classify
from app.services.ingestion.page_extract import extract_pages
from app.services.storage import get_object_store

log = get_logger(__name__)


def run_pipeline(document_id: uuid.UUID | str, *, actor: str = "system") -> None:
    with SessionLocal() as db:
        doc = db.get(Document, uuid.UUID(str(document_id)))
        if doc is None:
            log.warning("pipeline: document %s not found", document_id)
            return
        try:
            _process(db, doc, actor=actor)
        except Exception as exc:  # noqa: BLE001 — record and surface, don't crash the worker
            log.exception("pipeline failed for %s", doc.id)
            db.rollback()
            doc = db.get(Document, doc.id)
            if doc:
                doc.status = DocumentStatus.failed
                doc.error = str(exc)[:2000]
                doc.processed_at = datetime.now(UTC)
                record_event(db, actor=actor, action="document.failed",
                             target_type="document", target_id=str(doc.id),
                             meta={"error": str(exc)[:500]})
                db.commit()


def _process(db: Session, doc: Document, *, actor: str) -> None:
    settings = get_settings()
    doc.status = DocumentStatus.processing
    record_event(db, actor=actor, action="document.processing_started",
                 target_type="document", target_id=str(doc.id))
    db.commit()

    data = get_object_store().get_bytes(doc.storage_key)
    pages = extract_pages(data, doc.content_type, filename=doc.original_filename)
    full_text = "\n".join(p.text for p in pages)
    doc_type, language, doc_date = classify(full_text, filename=doc.original_filename)

    doc.page_count = len(pages)
    doc.doc_type = doc_type
    doc.language = language
    if doc_date is not None:
        doc.doc_date = doc_date

    cands, doc_notes = extract_fields(doc_type, pages)

    # replace any prior extraction (idempotent re-processing)
    for old in list(doc.fields):
        db.delete(old)
    db.flush()

    threshold = settings.confidence_threshold
    n_review = 0
    for c in cands:
        status = (
            FieldStatus.auto_accepted if c.confidence >= threshold else FieldStatus.needs_review
        )
        if status is FieldStatus.needs_review:
            n_review += 1
        db.add(
            ExtractionField(
                document_id=doc.id,
                field_key=c.field_key,
                label=c.label,
                value_text=c.value_text,
                original_value_text=c.value_text,
                value_json=c.value_json,
                entity_type=c.entity_type,
                extractor=c.extractor,
                source_kind=c.source_kind,
                page_no=c.page_no,
                bbox=c.bbox,
                source_snippet=c.source_snippet,
                confidence=c.confidence,
                status=status,
                review_note="; ".join(c.notes),
            )
        )

    ocr_pages = sum(1 for p in pages if p.source_kind == "ocr")
    doc.meta = {
        **(doc.meta or {}),
        "pipeline": {
            "pages": len(pages),
            "ocr_pages": ocr_pages,
            "fields_extracted": len(cands),
            "fields_needs_review": n_review,
            "threshold": threshold,
            "doc_notes": doc_notes,
            "classified_as": doc_type,
        },
    }
    doc.error = ""
    doc.processed_at = datetime.now(UTC)
    if not cands:
        doc.status = DocumentStatus.extracted
    elif n_review:
        doc.status = DocumentStatus.needs_review
    else:
        doc.status = DocumentStatus.ready

    record_event(
        db, actor=actor, action="document.extracted",
        target_type="document", target_id=str(doc.id),
        meta={"doc_type": doc_type, "fields": len(cands), "needs_review": n_review,
              "ocr_pages": ocr_pages, "notes": doc_notes},
    )
    db.commit()
    log.info("pipeline done: %s type=%s fields=%d review=%d status=%s",
             doc.id, doc_type, len(cands), n_review, doc.status)
