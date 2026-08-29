"""Domain-normalised term frequencies for the word cloud, filterable by
subsidiary / document type / date."""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DocChunk, Document
from app.services.topics.normalize import tokenize


def word_frequencies(
    db: Session,
    *,
    subsidiary_id: uuid.UUID | None = None,
    doc_type: str | None = None,
    since: date | None = None,
    limit: int = 60,
) -> list[dict]:
    stmt = select(DocChunk.text).join(Document, DocChunk.document_id == Document.id)
    if subsidiary_id is not None:
        stmt = stmt.where(
            (Document.subsidiary_id == subsidiary_id) | (Document.subsidiary_id.is_(None))
        )
    if doc_type:
        stmt = stmt.where(Document.doc_type == doc_type)
    if since is not None:
        stmt = stmt.where(Document.doc_date >= since)

    counter: Counter[str] = Counter()
    for (text,) in db.execute(stmt).all():
        counter.update(tokenize(text or ""))

    top = counter.most_common(limit)
    if not top:
        return []
    max_c = top[0][1]
    return [
        {"term": term, "count": count, "weight": round(count / max_c, 3)}
        for term, count in top
    ]
