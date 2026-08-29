"""Password hashing + JWT issue/verify (M6)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

_ALGO = "HS256"


def _b(plain: str) -> bytes:
    # bcrypt hard-caps at 72 bytes; truncate deterministically rather than error
    return plain.encode("utf-8")[:72]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_b(plain), bcrypt.gensalt()).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_b(plain), hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


def _token(claims: dict[str, Any], *, ttl: timedelta, token_type: str) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {
        **claims,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=_ALGO)


def create_access_token(claims: dict[str, Any]) -> str:
    s = get_settings()
    return _token(claims, ttl=timedelta(minutes=s.jwt_access_ttl_min), token_type="access")


def create_refresh_token(claims: dict[str, Any]) -> str:
    s = get_settings()
    return _token(claims, ttl=timedelta(days=s.jwt_refresh_ttl_days), token_type="refresh")


class TokenError(RuntimeError):
    pass


def decode_token(token: str, *, expect_type: str | None = None) -> dict[str, Any]:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[_ALGO])
    except JWTError as exc:
        raise TokenError(str(exc)) from exc
    if expect_type and payload.get("type") != expect_type:
        raise TokenError(f"expected {expect_type} token, got {payload.get('type')}")
    return payload
