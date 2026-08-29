"""Rebuild the topic set from the current document corpus."""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.audit import record_event
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.models import DocChunk, Document, Topic, TopicDoc
from app.services.topics.model import ModelInput, fit_topics

log = get_logger(__name__)


def _corpus(db: Session) -> ModelInput:
    """One text blob per document (its chunks joined) + its embedding (first chunk)."""
    by_doc_text: dict[str, list[str]] = defaultdict(list)
    by_doc_emb: dict[str, list[float]] = {}
    rows = db.execute(
        select(DocChunk.document_id, DocChunk.text, DocChunk.embedding, DocChunk.chunk_index)
        .order_by(DocChunk.document_id, DocChunk.chunk_index)
    ).all()
    for doc_id, text, emb, idx in rows:
        by_doc_text[str(doc_id)].append(text or "")
        if idx == 0:
            by_doc_emb[str(doc_id)] = list(emb)
    ids = list(by_doc_text)
    return ModelInput(
        document_ids=ids,
        texts=[" ".join(by_doc_text[i]) for i in ids],
        embeddings=[by_doc_emb.get(i, []) for i in ids] if by_doc_emb else None,
    )


def rebuild_topics(
    *, db: Session | None = None, n_topics: int = 5, engine: str = "nmf",
    actor: str = "system",
) -> dict:
    own = db is None
    db = db or SessionLocal()
    try:
        data = _corpus(db)
        if len(data.texts) < 2:
            return {"topics": 0, "note": "need at least 2 documents with indexed chunks"}

        results, used_engine = fit_topics(data, n_topics=n_topics, engine=engine)
        run_id = uuid.uuid4()

        # date range per document
        dranges = dict(
            db.execute(select(Document.id, Document.doc_date)).all()
        )

        db.execute(delete(Topic))  # keep only the latest run
        for r in results:
            member_ids = [uuid.UUID(d) for d, _ in r.members]
            dates = [dranges.get(mid) for mid in member_ids if dranges.get(mid)]
            topic = Topic(
                run_id=run_id, topic_index=r.topic_index, engine=used_engine,
                label=r.label, terms=r.terms, doc_count=len(r.members),
                first_seen=min(dates).date() if dates else None,
                last_seen=max(dates).date() if dates else None,
            )
            db.add(topic)
            db.flush()
            for doc_id, w in r.members:
                db.add(TopicDoc(topic_id=topic.id, document_id=uuid.UUID(doc_id), weight=w))

        stats = {"topics": len(results), "engine": used_engine,
                 "documents": len(data.texts), "run_id": str(run_id)}
        record_event(db, actor=actor, action="topics.rebuilt", target_type="topic_run",
                     target_id=str(run_id), meta=stats)
        if own:
            db.commit()
        else:
            db.flush()
        log.info("topics rebuilt: %s", stats)
        return stats
    finally:
        if own:
            db.close()
