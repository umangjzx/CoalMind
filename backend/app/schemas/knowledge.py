from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class EntityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    name: str
    normalized_key: str
    attrs: dict[str, Any]
    subsidiary_id: uuid.UUID | None
    document_id: uuid.UUID | None
    source_field_id: uuid.UUID | None
    confidence: float
    created_at: datetime


class RelationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    src_id: uuid.UUID
    dst_id: uuid.UUID
    predicate: str
    valid_from: date | None
    valid_to: date | None
    attrs: dict[str, Any]
    document_id: uuid.UUID | None
    source_field_id: uuid.UUID | None
    confidence: float


class NeighborOut(BaseModel):
    direction: str
    predicate: str
    valid_from: date | None
    entity: EntityOut
    relation_id: uuid.UUID
    source_field_id: uuid.UUID | None


class EntityDetail(BaseModel):
    entity: EntityOut
    neighbors: list[NeighborOut]


class EntityListResponse(BaseModel):
    items: list[EntityOut]
    total: int


class SubgraphResponse(BaseModel):
    entities: list[EntityOut]
    relations: list[RelationOut]


class ChunkHitOut(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_filename: str
    doc_type: str | None
    page_no: int | None
    text: str
    score: float


class SearchResponse(BaseModel):
    query: str
    hits: list[ChunkHitOut]


class GraphStats(BaseModel):
    entities: int
    entities_by_kind: dict[str, int]
    relations: int
    relations_by_predicate: dict[str, int]
    chunks: int
