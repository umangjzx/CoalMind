"""ask(): cache lookup -> retrieve -> compose -> persist a QAPair."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.audit import record_event
from app.core.logging import get_logger
from app.models import QAPair, QAStatus
from app.services.embeddings import get_embedder
from app.services.rag.answer import compose_answer
from app.services.rag.cache import _embed, lookup_cached, normalize_question
from app.services.rag.retrieve import retrieve

log = get_logger(__name__)


def ask(
    db: Session,
    question: str,
    *,
    subsidiary_id: uuid.UUID | None = None,
    actor: str = "system",
    actor_id: uuid.UUID | None = None,
    use_cache: bool = True,
) -> QAPair:
    question = question.strip()
    q_embedding = _embed(question)

    # 1. verified-answer cache
    if use_cache:
        hit = lookup_cached(db, q_embedding, subsidiary_id)
        if hit is not None:
            cached, sim = hit
            cached.hit_count += 1
            record_event(
                db, actor=actor, action="query.cache_hit", target_type="qa_pair",
                target_id=str(cached.id),
                meta={"question": question[:200], "similarity": round(sim, 3)},
            )
            db.commit()
            log.info("cache hit (sim=%.3f) for %r", sim, question[:80])
            # return a lightweight view of the cached answer as a fresh transcript row
            echo = QAPair(
                question=question, question_norm=normalize_question(question),
                question_embedding=q_embedding, answer_md=cached.answer_md,
                citations=cached.citations, evidence=cached.evidence,
                confidence=cached.confidence, status=QAStatus.answered,
                answer_mode="cache", subsidiary_id=subsidiary_id, asked_by_id=actor_id,
            )
            db.add(echo)
            db.commit()
            db.refresh(echo)
            return echo

    # 2. retrieve + compose
    retr = retrieve(db, question, subsidiary_id=subsidiary_id)
    ans = compose_answer(retr)

    qa = QAPair(
        question=question,
        question_norm=normalize_question(question),
        question_embedding=q_embedding,
        answer_md=ans.answer_md,
        citations=ans.citations,
        evidence=ans.evidence,
        confidence=ans.confidence,
        status=QAStatus.insufficient if ans.status == "insufficient" else QAStatus.answered,
        answer_mode=ans.mode,
        subsidiary_id=subsidiary_id,
        asked_by_id=actor_id,
    )
    db.add(qa)
    db.flush()
    record_event(
        db, actor=actor,
        action="query.declined" if ans.status == "insufficient" else "query.answered",
        target_type="qa_pair", target_id=str(qa.id),
        meta={
            "question": question[:200], "mode": ans.mode,
            "confidence": ans.confidence, "flagged": ans.flagged,
            "facts": len(retr.facts), "passages": len(retr.passages),
        },
    )
    db.commit()
    db.refresh(qa)
    return qa


# keep a reference so the embedder is importable from here too
__all__ = ["ask", "get_embedder"]
