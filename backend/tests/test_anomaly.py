"""M7 anomaly detection (FR-14) — unit (_diff) + DB-backed cross-document scan."""

from __future__ import annotations

import hashlib
import uuid

import pytest

from app.models import (
    Anomaly,
    AnomalyKind,
    AnomalyStatus,
    Document,
    DocumentStatus,
    ExtractionField,
    FieldStatus,
    KGEntity,
    KGRelation,
)
from app.services.anomaly.detect import _diff, scan_anomalies

# --- unit --------------------------------------------------------------------

def test_diff_ignores_rounding_noise():
    assert _diff(182.4, 176.5) is True
    assert _diff(100.0, 100.001) is False
    assert _diff(0.0, 0.0) is False
    assert _diff(50.0, 51.5) is True  # 3% apart


# --- DB-backed -------------------------------------------------------------

def _mk_reserve_doc(db, *, tag: str, as_on: str, proved: float,
                    indicated: float, inferred: float, total: float) -> Document:
    raw = f"anom-{tag}-{uuid.uuid4()}".encode()
    doc = Document(
        original_filename=f"anom_{tag}.pdf",
        content_type="application/pdf",
        sha256=hashlib.sha256(raw).hexdigest(),
        storage_key=f"docs/anom/{tag}.pdf",
        size_bytes=len(raw),
        status=DocumentStatus.ready,
        doc_type="geological_reserve_status",
    )
    db.add(doc)
    db.flush()

    def f(key, text, vj):
        db.add(ExtractionField(
            document_id=doc.id, field_key=key, label=key, value_text=text,
            original_value_text=text, value_json=vj, confidence=0.92,
            status=FieldStatus.auto_accepted,
        ))

    f("mine_name", "Anomtest Mine", None)
    f("block_name", "Anomtest Shared Block", None)
    f("reserves_as_on", as_on, {"iso": as_on})
    f("proved_reserve", str(proved), {"value": proved, "unit": "million_tonnes"})
    f("indicated_reserve", str(indicated), {"value": indicated, "unit": "million_tonnes"})
    f("inferred_reserve", str(inferred), {"value": inferred, "unit": "million_tonnes"})
    f("total_geological_reserve", str(total), {"value": total, "unit": "million_tonnes"})
    db.flush()
    return doc


@pytest.fixture
def two_reserve_reports(db_or_skip):
    """Same block, two 'as on' dates, proved reserve revised 182.4 -> 176.5."""
    from app.services.knowledge.resolver import resolve_document

    db = db_or_skip
    d1 = _mk_reserve_doc(db, tag="y2021", as_on="2021-04-01",
                         proved=182.4, indicated=64.1, inferred=21.7, total=268.2)
    d2 = _mk_reserve_doc(db, tag="y2023", as_on="2023-04-01",
                         proved=176.5, indicated=61.8, inferred=19.4, total=257.7)
    resolve_document(db, d1)
    resolve_document(db, d2)
    db.commit()
    yield d1, d2

    # teardown: anomalies referencing these docs, then graph + docs
    ids = {str(d1.id), str(d2.id)}
    for a in db.query(Anomaly).all():
        if any((e or {}).get("document_id") in ids for e in (a.evidence or [])):
            db.delete(a)
    for doc in (d1, d2):
        db.query(KGRelation).filter_by(document_id=doc.id).delete()
        db.query(KGEntity).filter_by(document_id=doc.id).delete()
        db.query(ExtractionField).filter_by(document_id=doc.id).delete()
        db.query(Document).filter_by(id=doc.id).delete()
    db.commit()


def _my_anoms(db, docs) -> list[Anomaly]:
    ids = {str(d.id) for d in docs}
    return [
        a for a in db.query(Anomaly).all()
        if any((e or {}).get("document_id") in ids for e in (a.evidence or []))
    ]


def test_scan_flags_cross_document_revision(db_or_skip, two_reserve_reports):
    db = db_or_skip
    stats = scan_anomalies(db)
    db.commit()
    assert stats["detected"] >= 1

    mine = _my_anoms(db, two_reserve_reports)
    revisions = [a for a in mine if a.kind == AnomalyKind.revision]
    assert revisions, f"expected a revision anomaly, got {[a.kind for a in mine]}"

    rev = revisions[0]
    assert rev.status == AnomalyStatus.open
    ev_values = {e["value"] for e in rev.evidence}
    assert {182.4, 176.5} <= ev_values
    assert "182.4" in rev.detail and "176.5" in rev.detail
    assert "proved" in rev.detail
    # clean category sums -> no false sum_mismatch
    assert not [a for a in mine if a.kind == AnomalyKind.sum_mismatch]


def test_scan_is_idempotent(db_or_skip, two_reserve_reports):
    db = db_or_skip
    scan_anomalies(db)
    db.commit()
    n1 = len(_my_anoms(db, two_reserve_reports))
    s2 = scan_anomalies(db)
    db.commit()
    n2 = len(_my_anoms(db, two_reserve_reports))
    assert n1 == n2 == 1
    assert s2["created"] == 0


def test_review_endpoint_transitions_status(client, db_or_skip, two_reserve_reports):
    db = db_or_skip
    scan_anomalies(db)
    db.commit()
    target = next(a for a in _my_anoms(db, two_reserve_reports)
                  if a.kind == AnomalyKind.revision)

    r = client.get("/anomalies", params={"kind": "revision"})
    assert r.status_code == 200
    assert r.json()["open_count"] >= 1

    r = client.post(
        f"/anomalies/{target.id}/review",
        json={"status": "acknowledged", "note": "confirmed with regional geologist"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "acknowledged"
    assert body["note"].startswith("confirmed")

    db.expire_all()
    assert db.get(Anomaly, target.id).status == AnomalyStatus.acknowledged
