from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ReviewQueueItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    document_filename: str
    doc_type: str | None
    field_key: str
    label: str
    value_text: str
    value_json: dict[str, Any] | None
    entity_type: str | None
    source_kind: str
    page_no: int | None
    bbox: dict[str, Any] | None
    source_snippet: str
    confidence: float
    review_note: str
    status: str


class ReviewQueueResponse(BaseModel):
    items: list[ReviewQueueItem]
    total: int


class ReviewAction(BaseModel):
    action: Literal["confirm", "correct", "reject"]
    value_text: str | None = Field(
        default=None, description="required when action == 'correct'"
    )
    note: str = ""


class ReviewResult(BaseModel):
    id: uuid.UUID
    status: str
    value_text: str
    document_id: uuid.UUID
    document_status: str
    reviewed_at: datetime | None
