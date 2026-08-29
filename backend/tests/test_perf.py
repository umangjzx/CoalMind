"""CI-safe perf gate (scripts/perf_bench.py).

Runs the deterministic (no live-LLM) latency probes and a small in-process load
test with generous thresholds — enough to catch a regression like unbounded
concurrent embedding, without flakiness or third-party API cost.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest

_HARNESS = Path(__file__).resolve().parents[2] / "scripts" / "perf_bench.py"


@pytest.fixture(scope="module")
def perf():
    if not _HARNESS.exists():
        pytest.skip("perf_bench.py not found")
    from sqlalchemy import text

    from app.core.db import SessionLocal, engine

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"database not available: {exc}")
    db = SessionLocal()
    try:
        n = db.execute(text("SELECT count(*) FROM doc_chunk")).scalar() or 0
    finally:
        db.close()
    if n == 0:
        pytest.skip("no indexed corpus - run dev.py ingest-samples && build-kg")

    os.environ["COALMIND_NARRATIVE_LLM"] = "0"
    spec = importlib.util.spec_from_file_location("perf_bench", _HARNESS)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["perf_bench"] = mod
    spec.loader.exec_module(mod)
    return mod


def test_deterministic_latency_within_budget(perf):
    rows = {t.name: t for t in perf.run_latency(include_llm=False)}
    # the fresh deterministic answer path (no LLM) must be well under the PRD's
    # 20 s fresh budget and its own tripwire
    det = next(t for k, t in rows.items() if "deterministic" in k)
    assert det.p95 <= perf.DETERMINISTIC_FRESH_TARGET_MS, det.as_dict()

    retr = next(t for k, t in rows.items() if "retrieve" in k)
    assert retr.p95 <= perf.RETRIEVE_TARGET_MS, retr.as_dict()

    # anomaly scan / report / audit-verify are all pure-DB + CPU: keep them snappy
    for key in ("anomaly.scan", "report.create", "audit.verify_chain"):
        t = next((v for k, v in rows.items() if k.startswith(key)), None)
        if t and not t.skipped:
            assert t.p95 <= t.target_ms, t.as_dict()


def test_concurrent_requests_no_errors_and_bounded(perf):
    results = perf.run_load(concurrency=12, rounds=2)
    for r in results:
        assert r.errors == 0, r.as_dict()
    q = next(r for r in results if "query" in r.scenario)
    # deterministic answers under 12-way concurrency must stay inside the PRD
    # cached-answer budget (5 s)
    assert q.pct(0.95) <= 5_000, q.as_dict()
