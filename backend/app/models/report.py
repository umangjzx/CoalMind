"""Generated reports and their append-only draft history (M3).

A `Report` is an officer's working document for one template + set of parameters.
Each render or human edit appends a `ReportVersion`; `author_kind` records whether
the AI or a human produced it, which is what the "AI vs human" provenance view
compares. Every figure in a version carries a citation back to an
`ExtractionField` (→ document, page).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import Timestamps, UUIDPk


class ReportStatus(enum.StrEnum):
    draft = "draft"            # rendered, all bound fields accepted
    in_review = "in_review"    # >=1 bound field is still needs_review -> finalize blocked
    final = "final"            # officer-approved, locked


class VersionAuthor(enum.StrEnum):
    ai = "ai"
    human = "human"


class Report(UUIDPk, Timestamps, Base):
    __tablename__ = "report"

    title: Mapped[str] = mapped_column(String(320))
    template_key: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[ReportStatus] = mapped_column(
        Enum(ReportStatus, name="report_status"), default=ReportStatus.draft, index=True
    )
    params: Mapped[dict] = mapped_column(JSONB, default=dict)  # officer inputs for the template

    subsidiary_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("subsidiary.id", ondelete="SET NULL"), nullable=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )

    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("report_version.id", ondelete="SET NULL", use_alter=True,
                   name="fk_report_current_version"),
        nullable=True,
    )
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finalized_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )

    versions: Mapped[list[ReportVersion]] = relationship(
        back_populates="report", cascade="all, delete-orphan",
        order_by="ReportVersion.version_no", foreign_keys="ReportVersion.report_id",
    )


class ReportVersion(UUIDPk, Base):
    __tablename__ = "report_version"

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    report_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("report.id", ondelete="CASCADE"), index=True
    )
    report: Mapped[Report] = relationship(back_populates="versions", foreign_keys=[report_id])

    version_no: Mapped[int] = mapped_column(Integer)
    author_kind: Mapped[VersionAuthor] = mapped_column(
        Enum(VersionAuthor, name="version_author"), default=VersionAuthor.ai
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    summary: Mapped[str] = mapped_column(String(400), default="")

    # structured render
    blocks: Mapped[list] = mapped_column(JSONB, default=list)
    content_md: Mapped[str] = mapped_column(Text, default="")     # flattened, for diffing/preview
    citations: Mapped[list] = mapped_column(JSONB, default=list)  # [{marker, document_id, page_no,
    #                                                               field_key, extraction_field_id,
    #                                                               snippet, confidence, value}]
    unresolved: Mapped[list] = mapped_column(JSONB, default=list)  # bound fields still needs_review
