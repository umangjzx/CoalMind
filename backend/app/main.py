"""FastAPI application factory for the CoalMind AI backend."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    log.info(
        "CoalMind backend %s starting — llm=%s embed=%s third_party_api=%s",
        __version__,
        settings.llm_provider,
        settings.embed_provider,
        settings.allow_third_party_api,
    )
    try:
        get_object_store_bucket()
    except Exception as exc:  # noqa: BLE001 — non-fatal at boot
        log.warning("object store not ready at startup: %s", exc)
    _warm_models()
    yield
    log.info("CoalMind backend shutting down")


def _warm_models() -> None:
    """Load the spaCy pipeline once at boot so the first ingestion isn't slow."""
    try:
        from app.services.extraction.ner import _nlp

        _nlp()
    except Exception as exc:  # noqa: BLE001
        log.warning("model warmup skipped: %s", exc)


def get_object_store_bucket() -> None:
    from app.services.storage import get_object_store

    get_object_store().ensure_bucket()


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()

    app = FastAPI(
        title="CoalMind AI",
        description="Document-intelligence & knowledge platform for CMPDI/CIL (SIH 26023)",
        version=__version__,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {"service": "coalmind-backend", "version": __version__, "docs": "/docs"}

    return app


app = create_app()
