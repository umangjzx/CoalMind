"""AI-Based Query & Response endpoints (M4, FR-7/8/9)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import Principal, get_actor, get_db, get_principal, resolve_actor_id
from app.core.config import get_settings
from app.models import QAPair, QAStatus
from app.schemas.query import AskRequest, AskResponse, QAListResponse, QAOut
from app.services.rag import ask, promote_answer, reject_answer

router = APIRouter(tags=["query"])


@router.post("", response_model=AskResponse)
def ask_question(
    body: AskRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_principal),
) -> AskResponse:
    scope = body.subsidiary_id
    if principal.scoped:
        if scope is not None and scope != principal.subsidiary_id:
            raise HTTPException(403, "query scope outside your subsidiary")
        scope = principal.subsidiary_id  # RBAC: restrict retrieval to own + national
    qa = ask(
        db, body.question, subsidiary_id=scope,
        actor=principal.email, actor_id=principal.user_id, use_cache=body.use_cache,
    )
    out = AskResponse.model_validate(qa, from_attributes=True)
    out.confidence_threshold = get_settings().confidence_threshold
    out.from_cache = qa.answer_mode == "cache"
    return out


@router.get("/history", response_model=QAListResponse)
def history(
    status: str | None = None, limit: int = 50, db: Session = Depends(get_db)
) -> QAListResponse:
    q = select(QAPair)
    if status:
        q = q.where(QAPair.status == status)
    total = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(
        q.order_by(QAPair.created_at.desc()).limit(min(limit, 200))
    ).scalars().all()
    return QAListResponse(items=[QAOut.model_validate(r) for r in rows], total=total)


@router.get("/cache", response_model=QAListResponse)
def cache(db: Session = Depends(get_db)) -> QAListResponse:
    rows = db.execute(
        select(QAPair).where(QAPair.status == QAStatus.verified)
        .order_by(QAPair.hit_count.desc(), QAPair.verified_at.desc())
    ).scalars().all()
    return QAListResponse(items=[QAOut.model_validate(r) for r in rows], total=len(rows))


@router.get("/{qa_id}", response_model=QAOut)
def get_qa(qa_id: uuid.UUID, db: Session = Depends(get_db)) -> QAOut:
    qa = db.get(QAPair, qa_id)
    if qa is None:
        raise HTTPException(404, "query not found")
    return QAOut.model_validate(qa)


@router.post("/{qa_id}/verify", response_model=QAOut)
def verify(
    qa_id: uuid.UUID, db: Session = Depends(get_db), actor: str = Depends(get_actor)
) -> QAOut:
    try:
        qa = promote_answer(db, qa_id, actor=actor, actor_id=resolve_actor_id(db, actor))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return QAOut.model_validate(qa)


@router.post("/{qa_id}/reject", response_model=QAOut)
def reject(
    qa_id: uuid.UUID, db: Session = Depends(get_db), actor: str = Depends(get_actor)
) -> QAOut:
    try:
        qa = reject_answer(db, qa_id, actor=actor, actor_id=resolve_actor_id(db, actor))
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return QAOut.model_validate(qa)
