from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

Check = Literal["ok", "down", "blocked", "skipped"]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    version: str
    checks: dict[str, Check]
    detail: dict[str, str] = {}


class VersionResponse(BaseModel):
    name: str = "coalmind-backend"
    version: str
    llm_provider: str
    embed_provider: str
    allow_third_party_api: bool
