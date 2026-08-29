from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class FieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    field_key: str
    label: str
    value_text: str
    original_value_text: str
    value_json: dict[str, Any] | None
    entity_type: str | None
    extractor: str
    source_kind: str
    page_no: int | None
    bbox: dict[str, Any] | None
    source_snippet: str
    confidence: float
    status: str
    review_note: str
    reviewed_at: datetime | None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_filename: str
    content_type: str
    sha256: str
    size_bytes: int
    page_count: int | None
    doc_type: str | None
    language: str | None
    doc_date: datetime | None
    status: str
    error: str
    processed_at: datetime | None
    meta: dict[str, Any]
    subsidiary_id: uuid.UUID | None
    created_at: datetime


class DocumentDetail(DocumentOut):
    fields: list[FieldOut] = []


class IngestItem(BaseModel):
    document: DocumentOut
    created: bool


class IngestResponse(BaseModel):
    items: list[IngestItem]
    queued_for_processing: int


class DocumentListResponse(BaseModel):
    items: list[DocumentOut]
    total: int
