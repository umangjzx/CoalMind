"""M6 auth — hashing + JWT (unit) + login / me / refresh (DB-backed)."""

from __future__ import annotations

import time

import pytest

from app.core.security import (
    TokenError,
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)

# --- unit -----------------------------------------------------------------

def test_password_hash_roundtrip():
    h = hash_password("coalmind-secret")
    assert h != "coalmind-secret"
    assert verify_password("coalmind-secret", h)
    assert not verify_password("wrong", h)
    assert not verify_password("anything", "")


def test_password_over_72_bytes_does_not_error():
    long = "x" * 200
    assert verify_password(long, hash_password(long))


def test_jwt_roundtrip_and_type_guard():
    tok = create_access_token({"sub": "u1", "role": "data_admin"})
    payload = decode_token(tok, expect_type="access")
    assert payload["sub"] == "u1" and payload["type"] == "access"
    with pytest.raises(TokenError):
        decode_token(tok, expect_type="refresh")
    with pytest.raises(TokenError):
        decode_token("not.a.token")


def test_jwt_expired(monkeypatch):
    from app.core import security

    monkeypatch.setattr(security.get_settings(), "jwt_access_ttl_min", 0, raising=False)
    tok = create_access_token({"sub": "u1"})
    time.sleep(1)
    with pytest.raises(TokenError):
        decode_token(tok)


# --- DB-backed ----------------------------------------------------------

def _seeded(db):
    from app.models import User

    return db.query(User).filter(User.email == "admin@coalindia.in").first()


def test_login_success_and_me(client, db_or_skip):
    if _seeded(db_or_skip) is None:
        pytest.skip("run scripts/dev.py seed first")
    r = client.post("/auth/login", json={"email": "admin@coalindia.in", "password": "coalmind"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "data_admin" and body["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "admin@coalindia.in" and me.json()["is_authenticated"] is True


def test_login_bad_password(client, db_or_skip):
    if _seeded(db_or_skip) is None:
        pytest.skip("seed first")
    r = client.post("/auth/login", json={"email": "admin@coalindia.in", "password": "nope"})
    assert r.status_code == 401


def test_me_without_token_is_dev_fallback(client):
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["is_authenticated"] is False


def test_refresh_issues_new_access_token(client, db_or_skip):
    if _seeded(db_or_skip) is None:
        pytest.skip("seed first")
    login = client.post(
        "/auth/login", json={"email": "admin@coalindia.in", "password": "coalmind"}
    ).json()
    r = client.post("/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert r.status_code == 200 and r.json()["access_token"]
    assert decode_token(r.json()["access_token"], expect_type="access")["role"] == "data_admin"
