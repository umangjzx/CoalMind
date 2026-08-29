"""M6 admin + RBAC — audit chain verification, role gates, user CRUD, row scoping."""

from __future__ import annotations

import uuid

import pytest

from app.audit import record_event, verify_chain
from app.models import AuditEvent


def _token(client, email, password="coalmind"):
    r = client.post("/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.skip(f"login for {email} failed — seed first")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# --- audit hash chain -------------------------------------------------

def test_verify_chain_on_live_log(db_or_skip):
    result = verify_chain(db_or_skip)
    assert result["ok"] is True
    assert result["checked"] >= 1


def test_tampered_row_breaks_chain(db_or_skip):
    ev = record_event(db_or_skip, actor="test", action="test.tamper_probe",
                      meta={"v": 1})
    db_or_skip.commit()
    seq = ev.seq
    # mutate the stored meta without recomputing the hash -> chain must detect it
    row = db_or_skip.get(AuditEvent, seq)
    row.meta = {"v": 999}
    db_or_skip.commit()
    result = verify_chain(db_or_skip)
    assert result["ok"] is False and result["first_broken_seq"] == seq

    # repair for other tests
    row.meta = {"v": 1}
    db_or_skip.commit()
    assert verify_chain(db_or_skip)["ok"] is True


# --- role gates -----------------------------------------------------

def test_admin_endpoints_require_role(client, db_or_skip):
    admin = _token(client, "admin@coalindia.in")
    geol = _token(client, "geologist@ccl.co.in")

    assert client.get("/admin/overview", headers=admin).status_code == 200
    assert client.get("/admin/users", headers=admin).status_code == 200
    assert client.get("/admin/audit/verify", headers=admin).json()["ok"] is True

    # a subsidiary geologist is neither data_admin nor ministry_official
    assert client.get("/admin/overview", headers=geol).status_code == 403
    assert client.get("/admin/users", headers=geol).status_code == 403


# --- user CRUD ----------------------------------------------------

def test_user_lifecycle(client, db_or_skip):
    admin = _token(client, "admin@coalindia.in")
    email = f"m6test-{uuid.uuid4().hex[:8]}@cil.in"

    created = client.post(
        "/admin/users", headers=admin,
        json={"email": email, "full_name": "M6 Test", "role": "reporting_officer",
              "password": "initial-pw"},
    )
    assert created.status_code == 201
    uid = created.json()["id"]

    patched = client.patch(
        f"/admin/users/{uid}", headers=admin, json={"role": "geologist", "is_active": True},
    )
    assert patched.status_code == 200 and patched.json()["role"] == "geologist"

    client.post(f"/admin/users/{uid}/password", headers=admin, json={"password": "new-pass-123"})
    assert client.post(
        "/auth/login", json={"email": email, "password": "new-pass-123"}
    ).status_code == 200

    # cleanup
    from app.models import User

    db_or_skip.query(User).filter(User.id == uuid.UUID(uid)).delete()
    db_or_skip.commit()


# --- RBAC row scoping -------------------------------------------

def test_geologist_document_scoping(client, db_or_skip):
    """A subsidiary geologist sees their subsidiary + national docs, not others'."""
    import hashlib

    from app.models import Document, DocumentStatus, Subsidiary

    ccl = db_or_skip.query(Subsidiary).filter(Subsidiary.code == "CCL").first()
    ecl = db_or_skip.query(Subsidiary).filter(Subsidiary.code == "ECL").first()
    if not ccl or not ecl:
        pytest.skip("seed first")

    def mkdoc(sub_id, tag):
        raw = f"scope-{tag}-{uuid.uuid4()}".encode()
        d = Document(original_filename=f"scope_{tag}.pdf", content_type="application/pdf",
                     sha256=hashlib.sha256(raw).hexdigest(), storage_key=f"docs/s/{tag}",
                     size_bytes=1, status=DocumentStatus.ready, subsidiary_id=sub_id)
        db_or_skip.add(d)
        db_or_skip.flush()
        return d

    d_ccl, d_ecl, d_nat = mkdoc(ccl.id, "ccl"), mkdoc(ecl.id, "ecl"), mkdoc(None, "nat")
    db_or_skip.commit()
    try:
        geol = _token(client, "geologist@ccl.co.in")
        seen = {
            i["original_filename"]
            for i in client.get("/ingestion/documents?limit=200", headers=geol).json()["items"]
        }
        assert "scope_ccl.pdf" in seen
        assert "scope_nat.pdf" in seen
        assert "scope_ecl.pdf" not in seen

        admin = _token(client, "admin@coalindia.in")
        seen_admin = {
            i["original_filename"]
            for i in client.get("/ingestion/documents?limit=200", headers=admin).json()["items"]
        }
        assert {"scope_ccl.pdf", "scope_ecl.pdf", "scope_nat.pdf"} <= seen_admin
    finally:
        for d in (d_ccl, d_ecl, d_nat):
            db_or_skip.delete(db_or_skip.get(Document, d.id))
        db_or_skip.commit()
