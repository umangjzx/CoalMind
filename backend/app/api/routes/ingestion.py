"""Document ingestion endpoints (FR-1, FR-15).

Upload one or many files; each is stored (content-addressed, deduped) and the
extraction pipeline is scheduled as a background task. Poll the document endpoints
for status / extracted fields.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Principal, get_actor, get_db, get_principal, resolve_actor_id
from app.models import Document, DocumentStatus
from app.schemas.ingestion import (
    DocumentDetail,
    DocumentListResponse,
    DocumentOut,
    IngestItem,
    IngestResponse,
)
from app.services.ingestion.pipeline import run_pipeline
from app.services.ingestion.store import ingest_bytes
from app.services.storage import get_object_store

router = APIRouter(tags=["ingestion"])

_MAX_BYTES = 40 * 1024 * 1024


@router.post("/documents", response_model=IngestResponse, status_code=201)
async def upload_documents(
    background: BackgroundTasks,
    files: list[UploadFile] = File(...),
    subsidiary_id: uuid.UUID | None = Form(default=None),
    db: Session = Depends(get_db),
    actor: str = Depends(get_actor),
) -> IngestResponse:
    actor_id = resolve_actor_id(db, actor)
    items: list[IngestItem] = []
    queued = 0
    for uf in files:
        data = await uf.read()
        if not data:
            raise HTTPException(400, f"{uf.filename}: empty file")
        if len(data) > _MAX_BYTES:
            raise HTTPException(413, f"{uf.filename}: exceeds {_MAX_BYTES // (1024 * 1024)} MB")
        result = ingest_bytes(
            db,
            data=data,
            filename=uf.filename or "upload.bin",
            content_type=uf.content_type or "application/octet-stream",
            subsidiary_id=subsidiary_id,
            uploaded_by_id=actor_id,
            actor=actor,
        )
        if result.created:
            background.add_task(run_pipeline, result.document.id, actor=actor)
            queued += 1
        items.append(IngestItem(document=DocumentOut.model_validate(result.document),
                                created=result.created))
    return IngestResponse(items=items, queued_for_processing=queued)


@router.get("/documents", response_model=DocumentListResponse)
def list_documents(
    status: DocumentStatus | None = None,
    doc_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> DocumentListResponse:
    q = select(Document)
    if principal.scoped:  # RBAC: subsidiary officers see their subsidiary + national
        q = q.where(
            (Document.subsidiary_id == principal.subsidiary_id)
            | (Document.subsidiary_id.is_(None))
        )
    if status is not None:
        q = q.where(Document.status == status)
    if doc_type is not None:
        q = q.where(Document.doc_type == doc_type)
    total = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(
        q.order_by(Document.created_at.desc()).limit(min(limit, 200)).offset(offset)
    ).scalars().all()
    return DocumentListResponse(
        items=[DocumentOut.model_validate(r) for r in rows], total=total
    )


@router.get("/documents/{document_id}", response_model=DocumentDetail)
def get_document(document_id: uuid.UUID, db: Session = Depends(get_db)) -> DocumentDetail:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "document not found")
    detail = DocumentDetail.model_validate(doc)
    detail.fields.sort(key=lambda f: (f.page_no or 0, -f.confidence))
    return detail


@router.get("/documents/{document_id}/file")
def get_document_file(document_id: uuid.UUID, db: Session = Depends(get_db)) -> RedirectResponse:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "document not found")
    url = get_object_store().presigned_get(doc.storage_key)
    return RedirectResponse(url)


@router.post("/documents/{document_id}/reprocess", response_model=DocumentOut, status_code=202)
def reprocess_document(
    document_id: uuid.UUID,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    actor: str = Depends(get_actor),
) -> DocumentOut:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "document not found")
    doc.status = DocumentStatus.received
    db.commit()
    background.add_task(run_pipeline, doc.id, actor=actor)
    return DocumentOut.model_validate(doc)
