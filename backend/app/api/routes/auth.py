"""Authentication endpoints (M6, FR-9)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import Principal, get_db, get_principal
from app.audit import record_event
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models import User
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RefreshRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(tags=["auth"])


def _claims(user: User) -> dict:
    return {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "subsidiary_id": str(user.subsidiary_id) if user.subsidiary_id else None,
    }


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.execute(
        select(User).where(User.email == body.email.strip().lower())
    ).scalar_one_or_none()
    ok = user is not None and user.is_active and verify_password(
        body.password, user.hashed_password
    )
    if not ok:
        record_event(db, actor=body.email, action="auth.login_failed",
                     meta={"email": body.email})
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid email or password")

    user.last_login_at = datetime.now(UTC)
    record_event(db, actor=user.email, action="auth.login", target_type="app_user",
                 target_id=str(user.id), meta={"role": user.role.value})
    db.commit()
    return TokenResponse(
        access_token=create_access_token(_claims(user)),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        payload = decode_token(body.refresh_token, expect_type="refresh")
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid refresh token: {exc}") from exc
    user = db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found or inactive")
    return TokenResponse(
        access_token=create_access_token(_claims(user)),
        refresh_token=None,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=MeResponse)
def me(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> MeResponse:
    if principal.user_id is None:
        # dev fallback with no seeded admin — synthesise a response
        return MeResponse(
            id=uuid.UUID(int=0), email=principal.email,
            full_name="(unauthenticated dev session)", role=principal.role.value,
            is_active=True, subsidiary_id=None, last_login_at=None,
            is_authenticated=False, scoped=False,
        )
    user = db.get(User, principal.user_id)
    out = MeResponse.model_validate(user)
    out.is_authenticated = principal.is_authenticated
    out.scoped = principal.scoped
    return out
