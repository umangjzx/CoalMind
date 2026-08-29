"""Orchestrator: (re)build the knowledge graph + vector index for one document."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.audit import record_event
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.models import Document
from app.services.ingestion.page_extract import Page
from app.services.knowledge.indexer import index_document
from app.services.knowledge.resolver import resolve_document

log = get_logger(__name__)


def build_knowledge(
    document_id: uuid.UUID | str,
    *,
    db: Session | None = None,
    pages: list[Page] | None = None,
    reindex: bool = True,
    actor: str = "system",
) -> dict:
    own_session = db is None
    db = db or SessionLocal()
    try:
        doc = db.get(Document, uuid.UUID(str(document_id)))
        if doc is None:
            return {"error": "document not found"}

        stats = resolve_document(db, doc)
        if reindex:
            try:
                stats["chunks"] = index_document(db, doc, pages=pages)
            except Exception as exc:  # noqa: BLE001 — embedding backend may be down
                log.warning("indexing skipped for %s: %s", doc.id, exc)
                stats["chunks"] = 0
                stats["index_error"] = str(exc)[:200]

        record_event(
            db, actor=actor, action="knowledge.built",
            target_type="document", target_id=str(doc.id), meta=stats,
        )
        if own_session:
            db.commit()
        else:
            db.flush()
        return stats
    finally:
        if own_session:
            db.close()
