from __future__ import annotations

import os

os.environ.setdefault("ALLOW_THIRD_PARTY_API", "true")

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture(scope="session")
def db_or_skip():
    """Yield a Session, or skip the test if Postgres isn't reachable (offline CI)."""
    from sqlalchemy import text

    from app.core.db import SessionLocal, engine

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"database not available: {exc}")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()
