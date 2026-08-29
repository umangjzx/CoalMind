"""Source documents and the structured fields extracted from them.

The ExtractionField row is the traceability unit: every figure that ends up in a
generated report or a query answer points back to one of these, which in turn
carries {document, page, bbox} and a confidence score.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import Timestamps, UUIDPk


class DocumentStatus(enum.StrEnum):
    received = "received"          # stored in MinIO, not yet processed
    processing = "processing"      # ingestion pipeline running
    extracted = "extracted"        # fields extracted, some may need review
    needs_review = "needs_review"  # >=1 field below confidence threshold
    ready = "ready"                # all fields verified / above threshold
    failed = "failed"


class FieldStatus(enum.StrEnum):
    auto_accepted = "auto_accepted"    # confidence >= threshold
    needs_review = "needs_review"      # confidence < threshold, queued
    verified = "verified"              # a human confirmed / corrected it
    rejected = "rejected"              # a human marked it wrong / not applicable


class Document(UUIDPk, Timestamps, Base):
    __tablename__ = "document"
    __table_args__ = (UniqueConstraint("sha256", name="uq_document_sha256"),)

    # provenance / storage
    original_filename: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    storage_key: Mapped[str] = mapped_column(String(1024))  # MinIO object key
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # classification (filled by M1 pipeline)
    doc_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    doc_date: Mapped[datetime | None] = mapped_column(nullable=True)

    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status"), default=DocumentStatus.received, index=True
    )
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)

    subsidiary_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("subsidiary.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )

    fields: Mapped[list[ExtractionField]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class ExtractionField(UUIDPk, Timestamps, Base):
    __tablename__ = "extraction_field"

    document_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("document.id", ondelete="CASCADE"), index=True
    )
    document: Mapped[Document] = relationship(back_populates="fields")

    # what was extracted
    field_key: Mapped[str] = mapped_column(String(128), index=True)  # e.g. "proved_reserve_mt"
    value_text: Mapped[str] = mapped_column(Text, default="")
    value_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # normalized value/unit
    # entity kind: Mine / Block / Seam / Mineral / ...
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # traceability — where in the source it came from
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # [x0,y0,x1,y1] in page units
    source_snippet: Mapped[str] = mapped_column(Text, default="")

    # confidence-aware drafting
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[FieldStatus] = mapped_column(
        Enum(FieldStatus, name="field_status"), default=FieldStatus.needs_review, index=True
    )
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
