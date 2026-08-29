from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class SecurityPosture(BaseModel):
    auth_required: bool
    llm_provider: str
    allow_third_party_api: bool
    llm_is_hosted: bool
    llm_effective: str  # "on-prem" | "hosted" | "blocked -> degraded"
    embeddings_provider: str
    embeddings_on_prem: bool
    audit_chain_ok: bool
    audit_events: int


class Overview(BaseModel):
    documents_by_status: dict[str, int]
    fields_by_status: dict[str, int]
    review_queue: int
    kg_entities: int
    kg_relations: int
    doc_chunks: int
    reports_by_status: dict[str, int]
    qa_by_status: dict[str, int]
    topics: int
    subsidiaries: int
    users: int
    security: SecurityPosture


class AuditRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    seq: int
    at: datetime
    actor: str
    action: str
    target_type: str | None
    target_id: str | None
    meta: dict[str, Any]
    entry_hash: str | None


class AuditListResponse(BaseModel):
    items: list[AuditRow]
    total: int


class ChainVerifyResponse(BaseModel):
    ok: bool
    checked: int
    first_broken_seq: int | None = None
    detail: str = ""


class AdminUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    subsidiary_id: uuid.UUID | None
    last_login_at: datetime | None
    created_at: datetime
    has_password: bool = False


class CreateUserRequest(BaseModel):
    email: str
    full_name: str
    role: str
    subsidiary_id: uuid.UUID | None = None
    password: str


class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    role: str | None = None
    subsidiary_id: uuid.UUID | None = None
    is_active: bool | None = None


class SetPasswordRequest(BaseModel):
    password: str


class ExtractionQuality(BaseModel):
    total_fields: int
    auto_accept_rate: float
    mean_confidence: float
    review_outcomes: dict[str, int]  # verified / rejected / pending
    ocr_page_ratio: float
    by_doc_type: dict[str, dict[str, float]]


class IngestionRow(BaseModel):
    id: uuid.UUID
    filename: str
    doc_type: str | None
    status: str
    fields: int
    needs_review: int
    ocr_pages: int
    error: str
    created_at: datetime


class IngestionMonitor(BaseModel):
    items: list[IngestionRow]
    failed: int
