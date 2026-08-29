"""Embed a document's text into the pgvector `doc_chunk` index."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models import DocChunk, Document
from app.services.embeddings import get_embedder
from app.services.ingestion.page_extract import Page, extract_pages
from app.services.knowledge.chunker import chunk_pages
from app.services.storage import get_object_store

log = get_logger(__name__)


def index_document(db: Session, document: Document, *, pages: list[Page] | None = None) -> int:
    if pages is None:
        data = get_object_store().get_bytes(document.storage_key)
        pages = extract_pages(data, document.content_type, filename=document.original_filename)

    chunks = chunk_pages(pages)
    db.execute(delete(DocChunk).where(DocChunk.document_id == document.id))
    if not chunks:
        db.flush()
        return 0

    embedder = get_embedder()
    vectors = embedder.embed([c.text for c in chunks])
    now = datetime.now(UTC)
    for c, vec in zip(chunks, vectors, strict=True):
        db.add(
            DocChunk(
                document_id=document.id,
                chunk_index=c.index,
                page_no=c.page_no,
                text=c.text,
                char_count=len(c.text),
                embedding=vec,
                embed_model=f"{embedder.name}:{embedder.model}",
                indexed_at=now,
            )
        )
    db.flush()
    log.info("indexed %d chunks for %s", len(chunks), document.id)
    return len(chunks)
