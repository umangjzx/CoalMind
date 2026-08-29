from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class TemplateParam(BaseModel):
    name: str
    label: str
    type: str
    required: bool = False
    options: list[dict[str, str]] | None = None
    help: str | None = None


class TemplateOut(BaseModel):
    key: str
    title: str
    description: str
    param_schema: list[TemplateParam]


class VersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_no: int
    author_kind: str
    author_id: uuid.UUID | None
    summary: str
    blocks: list[dict[str, Any]]
    content_md: str
    citations: list[dict[str, Any]]
    unresolved: list[dict[str, Any]]
    created_at: datetime


class VersionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_no: int
    author_kind: str
    summary: str
    created_at: datetime
    unresolved_count: int = 0


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    template_key: str
    status: str
    params: dict[str, Any]
    subsidiary_id: uuid.UUID | None
    current_version_id: uuid.UUID | None
    finalized_at: datetime | None
    created_at: datetime


class ReportDetail(ReportOut):
    current_version: VersionOut | None = None
    versions: list[VersionSummary] = []


class ReportListResponse(BaseModel):
    items: list[ReportOut]
    total: int


class CreateReportRequest(BaseModel):
    template_key: str
    params: dict[str, Any] = {}
    title: str | None = None
    subsidiary_id: uuid.UUID | None = None


class EditReportRequest(BaseModel):
    content_md: str
    summary: str = "officer edit"


class DiffResponse(BaseModel):
    from_: dict[str, Any]
    to: dict[str, Any]
    unified: str
