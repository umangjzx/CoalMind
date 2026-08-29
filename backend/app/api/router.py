"""Top-level API router. Feature routers are added here as milestones land."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    admin,
    anomalies,
    auth,
    health,
    ingestion,
    knowledge,
    query,
    reports,
    review,
    topics,
    validation,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(ingestion.router, prefix="/ingestion")
api_router.include_router(review.router, prefix="/review")
api_router.include_router(knowledge.router, prefix="/knowledge")
api_router.include_router(reports.router, prefix="/reports")
api_router.include_router(query.router, prefix="/query")
api_router.include_router(topics.router, prefix="/topics")
api_router.include_router(anomalies.router, prefix="/anomalies")
api_router.include_router(validation.router)
api_router.include_router(admin.router, prefix="/admin")
# M4: api_router.include_router(query.router, prefix="/query")
# M5: api_router.include_router(topics.router, prefix="/topics")
# M6: api_router.include_router(auth.router, prefix="/auth")
# M6: api_router.include_router(admin.router, prefix="/admin")
