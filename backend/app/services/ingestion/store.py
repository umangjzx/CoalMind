"""Persist an uploaded document: object storage + `Document` row, with SHA-256
dedupe so re-uploading the same bytes is a no-op."""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_event
from app.core.logging import get_logger
from app.models import Document, DocumentStatus
from app.services.storage import get_object_store

log = get_logger(__name__)


@dataclass(slots=True)
class IngestResult:
    document: Document
    created: bool  # False -> identical bytes already ingested


def ingest_bytes(
    db: Session,
    *,
    data: bytes,
    filename: str,
    content_type: str,
    subsidiary_id: uuid.UUID | None = None,
    uploaded_by_id: uuid.UUID | None = None,
    actor: str = "system",
) -> IngestResult:
    digest = hashlib.sha256(data).hexdigest()
    existing = db.execute(
        select(Document).where(Document.sha256 == digest)
    ).scalar_one_or_none()
    if existing is not None:
        return IngestResult(document=existing, created=False)

    stored = get_object_store().put_document(data, filename, content_type)
    doc = Document(
        original_filename=filename,
        content_type=content_type,
        sha256=digest,
        storage_key=stored.key,
        size_bytes=len(data),
        status=DocumentStatus.received,
        subsidiary_id=subsidiary_id,
        uploaded_by_id=uploaded_by_id,
    )
    db.add(doc)
    db.flush()
    record_event(
        db, actor=actor, action="document.ingested",
        target_type="document", target_id=str(doc.id),
        meta={"filename": filename, "sha256": digest, "size": len(data),
              "storage_key": stored.key},
    )
    db.commit()
    log.info("ingested %s (%s bytes) -> %s", filename, len(data), doc.id)
    return IngestResult(document=doc, created=True)
