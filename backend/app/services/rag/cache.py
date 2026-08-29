"""Verified-answer cache: officer-approved Q&A pairs served instantly for
semantically-matching questions (PRD "query history & reuse", <5s target)."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_event
from app.core.logging import get_logger
from app.models import QAPair, QAStatus
from app.services.embeddings import get_embedder

log = get_logger(__name__)

# cosine similarity above which a verified cached answer is reused verbatim.
# Tuned for bge-small: near-identical rephrasings land ~0.90-0.95, distinct
# questions stay below ~0.85.
CACHE_HIT_SIMILARITY = 0.90


def normalize_question(q: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", q.lower())).strip()[:500]


def lookup_cached(
    db: Session, question_embedding: list[float], subsidiary_id: uuid.UUID | None
) -> tuple[QAPair, float] | None:
    dist = QAPair.question_embedding.cosine_distance(question_embedding).label("d")
    stmt = select(QAPair, dist).where(QAPair.status == QAStatus.verified)
    if subsidiary_id is not None:
        stmt = stmt.where(
            (QAPair.subsidiary_id == subsidiary_id) | (QAPair.subsidiary_id.is_(None))
        )
    row = db.execute(stmt.order_by(dist).limit(1)).first()
    if row is None:
        return None
    qa, d = row
    sim = 1.0 - float(d)
    return (qa, sim) if sim >= CACHE_HIT_SIMILARITY else None


def promote_answer(db: Session, qa_id: uuid.UUID, *, actor: str,
                   actor_id: uuid.UUID | None = None) -> QAPair:
    qa = db.get(QAPair, qa_id)
    if qa is None:
        raise ValueError("qa_pair not found")
    if qa.status == QAStatus.insufficient:
        raise ValueError("cannot verify an 'insufficient' answer")
    qa.status = QAStatus.verified
    qa.verified_by_id = actor_id
    qa.verified_at = datetime.now(UTC)
    record_event(db, actor=actor, action="query.verified", target_type="qa_pair",
                 target_id=str(qa.id), meta={"question": qa.question[:200]})
    db.commit()
    log.info("qa_pair %s promoted to verified cache", qa.id)
    return qa


def reject_answer(db: Session, qa_id: uuid.UUID, *, actor: str,
                  actor_id: uuid.UUID | None = None) -> QAPair:
    qa = db.get(QAPair, qa_id)
    if qa is None:
        raise ValueError("qa_pair not found")
    qa.status = QAStatus.rejected
    qa.verified_by_id = actor_id
    qa.verified_at = datetime.now(UTC)
    record_event(db, actor=actor, action="query.rejected", target_type="qa_pair",
                 target_id=str(qa.id), meta={"question": qa.question[:200]})
    db.commit()
    return qa


def _embed(question: str) -> list[float]:
    return get_embedder().embed_one(question)
