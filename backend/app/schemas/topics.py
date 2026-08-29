from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class WordItem(BaseModel):
    term: str
    count: int
    weight: float


class WordCloudResponse(BaseModel):
    items: list[WordItem]
    filters: dict[str, str | None]


class TermWeight(BaseModel):
    term: str
    weight: float


class TopicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    topic_index: int
    engine: str
    label: str
    terms: list[TermWeight]
    doc_count: int
    summary: str
    first_seen: date | None
    last_seen: date | None
    created_at: datetime


class TopicDocOut(BaseModel):
    document_id: uuid.UUID
    filename: str
    doc_type: str | None
    doc_date: date | None
    subsidiary_id: uuid.UUID | None
    weight: float


class TopicDetail(TopicOut):
    documents: list[TopicDocOut] = []


class TopicListResponse(BaseModel):
    items: list[TopicOut]
    engine: str | None = None
    run_id: uuid.UUID | None = None


class TrendSeries(BaseModel):
    topic_index: int
    label: str
    counts: list[int]


class TrendsResponse(BaseModel):
    buckets: list[str]
    series: list[TrendSeries]
