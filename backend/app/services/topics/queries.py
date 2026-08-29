"""Read helpers for the topic API: current topics, drill-down, trend-over-time."""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Document, ExtractionField, Topic, TopicDoc
from app.services.topics.synthesize import topic_summary


def latest_run(db: Session) -> uuid.UUID | None:
    return db.execute(
        select(Topic.run_id).order_by(Topic.created_at.desc()).limit(1)
    ).scalar_one_or_none()


def list_topics(db: Session) -> list[Topic]:
    run = latest_run(db)
    if run is None:
        return []
    return list(
        db.execute(
            select(Topic).where(Topic.run_id == run).order_by(Topic.doc_count.desc())
        ).scalars()
    )


def topic_documents(db: Session, topic_id: uuid.UUID) -> list[tuple[Document, float]]:
    rows = db.execute(
        select(Document, TopicDoc.weight)
        .join(TopicDoc, TopicDoc.document_id == Document.id)
        .where(TopicDoc.topic_id == topic_id)
        .order_by(TopicDoc.weight.desc())
    ).all()
    return [(d, w) for d, w in rows]


def ensure_summary(db: Session, topic: Topic) -> Topic:
    if topic.summary:
        return topic
    doc_ids = [d.id for d, _ in topic_documents(db, topic.id)]
    snippets: list[str] = []
    if doc_ids:
        snippets = [
            s for (s,) in db.execute(
                select(ExtractionField.source_snippet)
                .where(ExtractionField.document_id.in_(doc_ids))
                .where(ExtractionField.source_snippet != "")
                .limit(6)
            ).all()
        ]
    topic.summary = topic_summary(
        topic.label, [t["term"] for t in topic.terms], snippets
    )
    db.commit()
    return topic


def trends(
    db: Session, *, subsidiary_id: uuid.UUID | None = None
) -> dict:
    """Per-topic document counts bucketed by year-month."""
    run = latest_run(db)
    if run is None:
        return {"buckets": [], "series": []}

    q = (
        select(Topic.topic_index, Topic.label, Document.doc_date)
        .join(TopicDoc, TopicDoc.topic_id == Topic.id)
        .join(Document, Document.id == TopicDoc.document_id)
        .where(Topic.run_id == run)
    )
    if subsidiary_id is not None:
        q = q.where(
            (Document.subsidiary_id == subsidiary_id) | (Document.subsidiary_id.is_(None))
        )

    by_topic: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    labels: dict[int, str] = {}
    buckets: set[str] = set()
    for tidx, label, ddate in db.execute(q).all():
        labels[tidx] = label
        key = ddate.strftime("%Y-%m") if ddate else "undated"
        by_topic[tidx][key] += 1
        buckets.add(key)

    ordered = sorted(b for b in buckets if b != "undated")
    if "undated" in buckets:
        ordered.append("undated")
    series = [
        {
            "topic_index": tidx,
            "label": labels[tidx],
            "counts": [by_topic[tidx].get(b, 0) for b in ordered],
        }
        for tidx in sorted(by_topic)
    ]
    return {"buckets": ordered, "series": series}
