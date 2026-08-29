"""Topic-modelling output (M5, PRD Module 2).

A `rebuild` produces one `run_id` worth of `Topic` rows; the API always serves the
latest run. `Topic.summary` (an LLM one-paragraph "what's driving this") is filled
lazily on drill-down. `TopicDoc` links each topic to its member documents with a
weight, which the trend query buckets by `document.doc_date`.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import Timestamps, UUIDPk


class Topic(UUIDPk, Timestamps, Base):
    __tablename__ = "topic"
    __table_args__ = (UniqueConstraint("run_id", "topic_index", name="uq_topic_run_index"),)

    run_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    topic_index: Mapped[int] = mapped_column(Integer)
    engine: Mapped[str] = mapped_column(String(16), default="nmf")  # nmf | lda | bertopic

    label: Mapped[str] = mapped_column(String(200), default="")
    terms: Mapped[list] = mapped_column(JSONB, default=list)  # [{term, weight}]
    doc_count: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str] = mapped_column(Text, default="")

    first_seen: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_seen: Mapped[date | None] = mapped_column(Date, nullable=True)

    docs: Mapped[list[TopicDoc]] = relationship(
        back_populates="topic", cascade="all, delete-orphan"
    )


class TopicDoc(Base):
    __tablename__ = "topic_doc"

    topic_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("topic.id", ondelete="CASCADE"), primary_key=True
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("document.id", ondelete="CASCADE"), primary_key=True
    )
    weight: Mapped[float] = mapped_column(Float, default=0.0)

    topic: Mapped[Topic] = relationship(back_populates="docs")
