from __future__ import annotations

import os

os.environ.setdefault("ALLOW_THIRD_PARTY_API", "true")

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(create_app())
