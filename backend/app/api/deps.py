"""Shared FastAPI dependencies.

Auth proper lands in M6. Until then endpoints identify the acting officer via an
``X-Actor-Email`` header (defaulting to the seeded reporting officer) purely so the
audit trail carries a real name.
"""

from __future__ import annotations

from fastapi import Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models import User

__all__ = ["get_db", "get_actor", "resolve_actor_id"]

_DEFAULT_ACTOR = "officer@cmpdi.co.in"


def get_actor(x_actor_email: str | None = Header(default=None)) -> str:
    return (x_actor_email or _DEFAULT_ACTOR).strip().lower()


def resolve_actor_id(db: Session, actor_email: str):
    return db.execute(
        select(User.id).where(User.email == actor_email)
    ).scalar_one_or_none()
