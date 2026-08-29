"""Liveness / readiness endpoints.

`/health` probes every external dependency (Postgres, MinIO, the configured LLM
and embedder) and reports a per-check status. It returns HTTP 200 even when
degraded — orchestrators can decide what to do; humans get a readable picture.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app import __version__
from app.core.config import get_settings
from app.core.db import engine
from app.schemas.health import HealthResponse, VersionResponse
from app.services.embeddings import get_embedder
from app.services.embeddings.base import EmbeddingUnavailable
from app.services.llm import get_llm
from app.services.llm.base import LLMUnavailable
from app.services.storage import get_object_store

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    checks: dict[str, str] = {}
    detail: dict[str, str] = {}

    # --- Postgres ---
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["db"] = "down"
        detail["db"] = str(exc)[:200]

    # --- MinIO ---
    try:
        checks["storage"] = "ok" if get_object_store().health() else "down"
    except Exception as exc:  # noqa: BLE001
        checks["storage"] = "down"
        detail["storage"] = str(exc)[:200]

    # --- LLM ---
    try:
        checks["llm"] = "ok" if get_llm().health() else "down"
    except LLMUnavailable as exc:
        checks["llm"] = "blocked"
        detail["llm"] = str(exc)[:200]
    except Exception as exc:  # noqa: BLE001
        checks["llm"] = "down"
        detail["llm"] = str(exc)[:200]

    # --- Embeddings ---
    try:
        checks["embeddings"] = "ok" if get_embedder().health() else "down"
    except EmbeddingUnavailable as exc:
        checks["embeddings"] = "blocked"
        detail["embeddings"] = str(exc)[:200]
    except Exception as exc:  # noqa: BLE001
        checks["embeddings"] = "down"
        detail["embeddings"] = str(exc)[:200]

    # DB is the only hard dependency for the process to be useful at all.
    status = "ok" if checks.get("db") == "ok" else "degraded"
    return HealthResponse(status=status, version=__version__, checks=checks, detail=detail)


@router.get("/version", response_model=VersionResponse)
def version() -> VersionResponse:
    s = get_settings()
    return VersionResponse(
        version=__version__,
        llm_provider=s.llm_provider,
        embed_provider=s.embed_provider,
        allow_third_party_api=s.allow_third_party_api,
    )
