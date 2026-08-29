"""Detected inconsistencies between historical and new data for the same entity
(M7, FR-14).

A scan compares knowledge-graph fact nodes (reserves, production figures) that
describe the same anchor entity + category and records disagreements. Each row has
a stable ``signature`` so re-scanning updates rather than duplicates, and an
officer workflow (open -> acknowledged / resolved / dismissed).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import Timestamps, UUIDPk


class AnomalyKind(enum.StrEnum):
    contradiction = "contradiction"     # same entity+category+period, different value
    revision = "revision"               # value changed across dates (historical vs new)
    sum_mismatch = "sum_mismatch"       # proved+indicated+inferred != stated total
    out_of_range = "out_of_range"       # implausible value (negative, %>100, ...)
    trend_break = "trend_break"         # a figure far from the entity's other figures


class AnomalySeverity(enum.StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class AnomalyStatus(enum.StrEnum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"
    dismissed = "dismissed"


class Anomaly(UUIDPk, Timestamps, Base):
    __tablename__ = "anomaly"
    __table_args__ = (UniqueConstraint("signature", name="uq_anomaly_signature"),)

    signature: Mapped[str] = mapped_column(String(300), index=True)
    kind: Mapped[AnomalyKind] = mapped_column(Enum(AnomalyKind, name="anomaly_kind"), index=True)
    severity: Mapped[AnomalySeverity] = mapped_column(
        Enum(AnomalySeverity, name="anomaly_severity"), default=AnomalySeverity.medium
    )
    status: Mapped[AnomalyStatus] = mapped_column(
        Enum(AnomalyStatus, name="anomaly_status"), default=AnomalyStatus.open, index=True
    )

    title: Mapped[str] = mapped_column(String(320))
    detail: Mapped[str] = mapped_column(Text, default="")

    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("kg_entity.id", ondelete="SET NULL"), nullable=True
    )
    subsidiary_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("subsidiary.id", ondelete="SET NULL"), nullable=True
    )
    # [{document_id, filename, page_no, field_key, value, as_on}]
    evidence: Mapped[list] = mapped_column(JSONB, default=list)

    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
