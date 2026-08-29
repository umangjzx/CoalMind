"""Natural-language Q&A: every question asked, its answer, and the officer-verified
subset that becomes a reusable answer cache (M4, PRD Module 3).

`status`:
  answered      - RAG produced an answer, not yet reviewed
  verified      - an officer confirmed it -> served from cache for matching questions
  insufficient  - retrieval found nothing confident enough; the system declined (FR-8)
  rejected      - an officer marked the answer wrong
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import get_settings
from app.core.db import Base
from app.models.base import Timestamps, UUIDPk

_EMBED_DIM = get_settings().embed_dim


class QAStatus(enum.StrEnum):
    answered = "answered"
    verified = "verified"
    insufficient = "insufficient"
    rejected = "rejected"


class QAPair(UUIDPk, Timestamps, Base):
    __tablename__ = "qa_pair"

    question: Mapped[str] = mapped_column(Text)
    question_norm: Mapped[str] = mapped_column(String(500), index=True)
    question_embedding: Mapped[list[float]] = mapped_column(Vector(_EMBED_DIM))

    answer_md: Mapped[str] = mapped_column(Text, default="")
    # [{marker, document_id, page_no, field_key, extraction_field_id, snippet, confidence}]
    citations: Mapped[list] = mapped_column(JSONB, default=list)
    # ranked retrieval trace: [{kind, text, document_id, page_no, score, source_field_id}]
    evidence: Mapped[list] = mapped_column(JSONB, default=list)

    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[QAStatus] = mapped_column(
        Enum(QAStatus, name="qa_status"), default=QAStatus.answered, index=True
    )
    answer_mode: Mapped[str] = mapped_column(String(16), default="rag")  # rag | search_only | cache

    subsidiary_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("subsidiary.id", ondelete="SET NULL"), nullable=True
    )
    asked_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    verified_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)  # times reused from cache
