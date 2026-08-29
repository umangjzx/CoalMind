"""Shared FastAPI dependencies: DB session + the request Principal (M6).

Auth is bearer-token based. When ``AUTH_REQUIRED`` is false (dev/demo default) a
request without a valid token acts as the seeded ``data_admin`` so the earlier
milestones keep working unchanged; flip the flag for a locked-down deployment.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import TokenError, decode_token
from app.models import User, UserRole

__all__ = [
    "get_db", "Principal", "get_principal", "require_roles", "visible_subsidiary_ids",
    "get_actor", "resolve_actor_id",
]

# roles that are NOT limited to one subsidiary
_GLOBAL_ROLES = {UserRole.data_admin, UserRole.ministry_official}
_DEV_ACTOR_EMAIL = "admin@coalindia.in"


@dataclass(slots=True)
class Principal:
    email: str
    role: UserRole | None
    user_id: uuid.UUID | None = None
    subsidiary_id: uuid.UUID | None = None
    is_authenticated: bool = False

    @property
    def scoped(self) -> bool:
        """True when this principal only sees its own subsidiary + national data."""
        return self.role not in _GLOBAL_ROLES and self.subsidiary_id is not None


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def get_principal(
    authorization: str | None = Header(default=None),
    x_actor_email: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Principal:
    settings = get_settings()
    token = _bearer(authorization)

    if token:
        try:
            payload = decode_token(token, expect_type="access")
        except TokenError as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid token: {exc}") from exc
        user = db.get(User, uuid.UUID(payload["sub"]))
        if user is None or not user.is_active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found or inactive")
        return Principal(
            email=user.email, role=user.role, user_id=user.id,
            subsidiary_id=user.subsidiary_id, is_authenticated=True,
        )

    if settings.auth_required:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "authentication required")

    # dev/demo fallback — behave as the seeded data_admin, attribute audit to X-Actor-Email
    admin = db.execute(
        select(User).where(User.email == _DEV_ACTOR_EMAIL)
    ).scalar_one_or_none()
    email = (x_actor_email or (admin.email if admin else _DEV_ACTOR_EMAIL)).strip().lower()
    return Principal(
        email=email,
        role=admin.role if admin else UserRole.data_admin,
        user_id=admin.id if admin else None,
        subsidiary_id=None,
        is_authenticated=False,
    )


def require_roles(*roles: UserRole):
    def _dep(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"requires role: {', '.join(r.value for r in roles)}",
            )
        return principal

    return _dep


# --- back-compat helpers used by the M1-M5 routes (now flow through the Principal) ---

def get_actor(principal: Principal = Depends(get_principal)) -> str:
    return principal.email


def resolve_actor_id(db: Session, actor_email: str) -> uuid.UUID | None:
    return db.execute(
        select(User.id).where(User.email == actor_email)
    ).scalar_one_or_none()


def visible_subsidiary_ids(principal: Principal) -> set[uuid.UUID] | None:
    """Subsidiary ids this principal may see, or None for 'all'.

    Scoped principals see their own subsidiary plus national (NULL subsidiary_id) —
    callers must OR in the NULL case themselves.
    """
    if not principal.scoped:
        return None
    return {principal.subsidiary_id} if principal.subsidiary_id else set()
