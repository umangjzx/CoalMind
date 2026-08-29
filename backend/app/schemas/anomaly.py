from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import AnomalyKind, AnomalySeverity, AnomalyStatus


class AnomalyEvidence(BaseModel):
    document_id: str | None = None
    filename: str | None = None
    page_no: int | None = None
    field_key: str | None = None
    value: float | None = None
    as_on: str | None = None


class AnomalyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    signature: str
    kind: AnomalyKind
    severity: AnomalySeverity
    status: AnomalyStatus
    title: str
    detail: str = ""
    entity_id: uuid.UUID | None = None
    subsidiary_id: uuid.UUID | None = None
    evidence: list[AnomalyEvidence] = []
    reviewed_by_id: uuid.UUID | None = None
    reviewed_at: datetime | None = None
    note: str = ""
    created_at: datetime
    updated_at: datetime


class AnomalyListResponse(BaseModel):
    items: list[AnomalyOut]
    total: int
    open_count: int
    by_kind: dict[str, int] = {}
    by_severity: dict[str, int] = {}


class AnomalyReview(BaseModel):
    status: AnomalyStatus
    note: str = ""


class ScanResponse(BaseModel):
    detected: int = 0
    created: int = 0
    updated: int = 0
    auto_resolved: int = 0
    by_kind: dict[str, int] = {}
