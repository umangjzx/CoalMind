"""Word Cloud & Topic Identification endpoints (M5, FR-6)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_db
from app.schemas.topics import (
    TopicDetail,
    TopicDocOut,
    TopicListResponse,
    TopicOut,
    TrendsResponse,
    WordCloudResponse,
)
from app.services import topics as tsvc
from app.services.topics.queries import latest_run

router = APIRouter(tags=["topics"])


@router.get("/wordcloud", response_model=WordCloudResponse)
def wordcloud(
    subsidiary_id: uuid.UUID | None = None,
    doc_type: str | None = None,
    since: date | None = None,
    limit: int = 60,
    db: Session = Depends(get_db),
) -> WordCloudResponse:
    items = tsvc.word_frequencies(
        db, subsidiary_id=subsidiary_id, doc_type=doc_type, since=since, limit=limit
    )
    return WordCloudResponse(
        items=items,
        filters={
            "subsidiary_id": str(subsidiary_id) if subsidiary_id else None,
            "doc_type": doc_type,
            "since": since.isoformat() if since else None,
        },
    )


@router.get("", response_model=TopicListResponse)
def list_topics(db: Session = Depends(get_db)) -> TopicListResponse:
    rows = tsvc.list_topics(db)
    return TopicListResponse(
        items=[TopicOut.model_validate(t) for t in rows],
        engine=rows[0].engine if rows else None,
        run_id=rows[0].run_id if rows else None,
    )


@router.get("/trends", response_model=TrendsResponse)
def trends(
    subsidiary_id: uuid.UUID | None = None, db: Session = Depends(get_db)
) -> TrendsResponse:
    return TrendsResponse(**tsvc.trends(db, subsidiary_id=subsidiary_id))


@router.post("/rebuild", response_model=TopicListResponse)
def rebuild(
    n_topics: int = Query(5, ge=2, le=20),
    engine: str = Query("nmf", pattern="^(nmf|lda|bertopic)$"),
    db: Session = Depends(get_db),
    actor: str = Depends(get_actor),
) -> TopicListResponse:
    stats = tsvc.rebuild_topics(db=db, n_topics=n_topics, engine=engine, actor=actor)
    db.commit()
    if stats.get("topics", 0) == 0:
        raise HTTPException(422, stats.get("note", "no topics produced"))
    rows = tsvc.list_topics(db)
    return TopicListResponse(
        items=[TopicOut.model_validate(t) for t in rows],
        engine=stats.get("engine"), run_id=latest_run(db),
    )


@router.get("/{topic_id}", response_model=TopicDetail)
def topic_detail(topic_id: uuid.UUID, db: Session = Depends(get_db)) -> TopicDetail:
    from app.models import Topic

    topic = db.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(404, "topic not found")
    topic = tsvc.ensure_summary(db, topic)
    detail = TopicDetail.model_validate(topic)
    detail.documents = [
        TopicDocOut(
            document_id=d.id, filename=d.original_filename, doc_type=d.doc_type,
            doc_date=d.doc_date.date() if d.doc_date else None,
            subsidiary_id=d.subsidiary_id, weight=w,
        )
        for d, w in tsvc.topic_documents(db, topic.id)
    ]
    return detail
