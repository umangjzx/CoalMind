from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    subsidiary_id: uuid.UUID | None = None
    use_cache: bool = True


class QAOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question: str
    answer_md: str
    citations: list[dict[str, Any]]
    evidence: list[dict[str, Any]]
    confidence: float
    status: str
    answer_mode: str
    subsidiary_id: uuid.UUID | None
    verified_at: datetime | None
    hit_count: int
    created_at: datetime


class AskResponse(QAOut):
    # defaults so model_validate(qa) passes; the route sets the real values
    confidence_threshold: float = 0.75  # so the UI can flag "verify before use"
    from_cache: bool = False


class QAListResponse(BaseModel):
    items: list[QAOut]
    total: int
