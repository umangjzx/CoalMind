"""End-to-end review-flow test against a live Postgres (skipped when unavailable)."""

from __future__ import annotations

import hashlib
import uuid

import pytest

from app.models import Document, DocumentStatus, ExtractionField, FieldStatus


@pytest.fixture
def review_doc(db_or_skip):
    db = db_or_skip
    raw = f"review-flow-{uuid.uuid4()}".encode()
    doc = Document(
        original_filename="rf.pdf",
        content_type="application/pdf",
        sha256=hashlib.sha256(raw).hexdigest(),
        storage_key="docs/xx/rf.pdf",
        size_bytes=len(raw),
        status=DocumentStatus.needs_review,
        doc_type="geological_reserve_status",
    )
    db.add(doc)
    db.flush()
    field = ExtractionField(
        document_id=doc.id,
        field_key="proved_reserve",
        label="Proved reserve",
        value_text="182.40",
        original_value_text="182.40",
        confidence=0.4,
        status=FieldStatus.needs_review,
    )
    db.add(field)
    db.commit()
    yield doc, field
    # a confirm/correct triggers a knowledge rebuild -> clean those rows too
    from app.models import KGEntity, KGRelation

    db.query(KGRelation).filter_by(document_id=doc.id).delete()
    db.query(KGEntity).filter_by(document_id=doc.id).delete()
    db.query(ExtractionField).filter_by(document_id=doc.id).delete()
    db.query(Document).filter_by(id=doc.id).delete()
    db.commit()


def test_queue_lists_the_field(client, review_doc):
    _doc, field = review_doc
    r = client.get("/review/queue?limit=300")
    assert r.status_code == 200
    ids = {i["id"] for i in r.json()["items"]}
    assert str(field.id) in ids


def test_confirm_verifies_and_audits(client, db_or_skip, review_doc):
    doc, field = review_doc
    r = client.post(f"/review/fields/{field.id}", json={"action": "confirm"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "verified"
    assert body["document_status"] == "ready"  # was the only pending field

    from app.models.audit import AuditEvent

    ev = (
        db_or_skip.query(AuditEvent)
        .filter(AuditEvent.action == "field.confirm",
                AuditEvent.target_id == str(field.id))
        .one()
    )
    assert ev.meta["before"] == "182.40"


def test_correct_keeps_original_and_updates_value(client, review_doc):
    _doc, field = review_doc
    r = client.post(
        f"/review/fields/{field.id}",
        json={"action": "correct", "value_text": "180.00", "note": "reconciled"},
    )
    assert r.status_code == 200
    assert r.json()["value_text"] == "180.00"

    r2 = client.get(f"/ingestion/documents/{field.document_id}")
    f = next(x for x in r2.json()["fields"] if x["id"] == str(field.id))
    assert f["original_value_text"] == "182.40"
    assert f["value_text"] == "180.00"
    assert f["status"] == "verified"


def test_correct_requires_value(client, review_doc):
    _doc, field = review_doc
    r = client.post(f"/review/fields/{field.id}", json={"action": "correct"})
    assert r.status_code == 422
