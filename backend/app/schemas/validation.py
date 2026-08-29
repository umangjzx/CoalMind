from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class PerfRow(BaseModel):
    path: str
    p50_ms: float
    p95_ms: float
    target_ms: float
    prd: bool = False


class LoadResult(BaseModel):
    concurrency: int
    query_p95_ms: float
    query_rps: float
    health_p95_ms: float
    errors: int


class TestSummary(BaseModel):
    backend: int
    frontend_build: bool
    notes: str


class ValidationSummary(BaseModel):
    # `extraction` is the raw report from scripts/eval_extraction.run(); {} if the
    # sample corpus has not been generated
    extraction: dict[str, Any] = {}
    performance: list[PerfRow] = []
    load: LoadResult | None = None
    tests: TestSummary
    methodology: list[str] = []
