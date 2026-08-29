#!/usr/bin/env python
"""Performance & load validation for CoalMind against the PRD NFRs.

    python scripts/dev.py perf            # latency bench + in-process load test
    python scripts/dev.py perf --latency  # latency bench only
    python scripts/dev.py perf --load     # concurrency / load test only
    python scripts/dev.py perf --json     # machine-readable

PRD NFR §9:  cached / verified answer < 5 s   ·   fresh RAG query < 20 s.

The latency bench drives the service layer directly (own DB session, warm
embedder). The load test fires concurrent requests at the FastAPI app through an
in-process ASGI transport - no network, no external server - so it exercises the
real async stack + DB connection pool. Both need the sample corpus ingested
(`python scripts/dev.py bootstrap && dev.py ingest-samples && dev.py build-kg`).

Exit code is non-zero if any PRD target is missed.
"""

from __future__ import annotations

import asyncio
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

CACHED_TARGET_MS = 5_000     # PRD: cached / verified answer
FRESH_TARGET_MS = 20_000     # PRD: fresh RAG query
# internal budgets (not PRD, but a regression tripwire)
RETRIEVE_TARGET_MS = 3_000
DETERMINISTIC_FRESH_TARGET_MS = 4_000
ANOMALY_SCAN_TARGET_MS = 6_000
REPORT_TARGET_MS = 12_000
INGEST_PARSE_TARGET_MS = 4_000
AUDIT_VERIFY_TARGET_MS = 4_000


@dataclass(slots=True)
class Timing:
    name: str
    target_ms: float
    samples_ms: list[float] = field(default_factory=list)
    note: str = ""
    skipped: bool = False

    def _p(self, q: float) -> float:
        if not self.samples_ms:
            return 0.0
        s = sorted(self.samples_ms)
        if len(s) == 1:
            return s[0]
        idx = min(len(s) - 1, int(round(q * (len(s) - 1))))
        return s[idx]

    @property
    def p50(self) -> float:
        return round(statistics.median(self.samples_ms), 1) if self.samples_ms else 0.0

    @property
    def p95(self) -> float:
        return round(self._p(0.95), 1)

    @property
    def worst(self) -> float:
        return round(max(self.samples_ms), 1) if self.samples_ms else 0.0

    @property
    def ok(self) -> bool:
        return self.skipped or (bool(self.samples_ms) and self.p95 <= self.target_ms)

    def as_dict(self) -> dict:
        return {
            "name": self.name, "target_ms": self.target_ms, "n": len(self.samples_ms),
            "p50_ms": self.p50, "p95_ms": self.p95, "worst_ms": self.worst,
            "ok": self.ok, "skipped": self.skipped, "note": self.note,
        }


def _time(fn, *, iters: int, warmup: int = 1) -> list[float]:
    for _ in range(warmup):
        fn()
    out: list[float] = []
    for _ in range(iters):
        t0 = time.perf_counter()
        fn()
        out.append((time.perf_counter() - t0) * 1000.0)
    return out


# --------------------------------------------------------------------------- #
# latency bench
# --------------------------------------------------------------------------- #

def run_latency(*, include_llm: bool = True) -> list[Timing]:
    from app.core.db import SessionLocal
    from app.models import EntityKind, KGEntity
    from app.services.anomaly import scan_anomalies

    results: list[Timing] = []
    db = SessionLocal()
    try:
        _warm_embedder()

        # --- retrieval only -------------------------------------------------
        from app.services.rag.retrieve import retrieve

        q = "What is the proved reserve for Jhanjra Block-II?"
        t = Timing("rag.retrieve (graph + vector)", RETRIEVE_TARGET_MS)
        t.samples_ms = _time(lambda: retrieve(db, q), iters=15)
        results.append(t)

        # --- fresh answer, deterministic (no LLM) --------------------------
        from app.services.rag import ask

        os.environ["COALMIND_NARRATIVE_LLM"] = "0"
        t = Timing("rag.ask fresh — deterministic (no LLM)", DETERMINISTIC_FRESH_TARGET_MS)
        t.samples_ms = _time(
            lambda: ask(db, q, actor="perf@bench", use_cache=False), iters=10
        )
        results.append(t)

        # --- cached answer -------------------------------------------------
        results.append(_bench_cached(db))

        # --- fresh answer, live LLM --------------------------------------
        if include_llm:
            results.append(_bench_fresh_llm(db, q))

        # --- anomaly scan ------------------------------------------------
        t = Timing("anomaly.scan (full KG)", ANOMALY_SCAN_TARGET_MS)
        t.samples_ms = _time(lambda: scan_anomalies(db), iters=5)
        results.append(t)

        # --- report generation ----------------------------------------
        results.append(_bench_report(db, KGEntity, EntityKind))

        # --- ingestion parse hot path -------------------------------
        results.append(_bench_ingest_parse())

        # --- audit chain verification ------------------------------
        from app.audit.verify import verify_chain

        t = Timing("audit.verify_chain", AUDIT_VERIFY_TARGET_MS)
        t.samples_ms = _time(lambda: verify_chain(db), iters=10)
        results.append(t)

        return results
    finally:
        db.close()


def _warm_embedder() -> None:
    from app.services.embeddings import get_embedder

    get_embedder().embed_one("warm up the embedding model")


def _bench_cached(db) -> Timing:
    from app.services.rag import ask, promote_answer

    t = Timing("rag.ask — cached / verified hit", CACHED_TARGET_MS)
    try:
        os.environ["COALMIND_NARRATIVE_LLM"] = "0"
        seed_q = "What is the proved reserve of Jhanjra Block-II?"
        seed = ask(db, seed_q, actor="perf@bench", use_cache=False)
        promote_answer(db, seed.id, actor="perf@bench")
        # confirm it actually hits cache before timing (exact + paraphrase)
        hit = ask(db, seed_q, actor="perf@bench")
        if hit.answer_mode != "cache":
            t.skipped = True
            t.note = f"cache did not hit (mode={hit.answer_mode}); skipped"
            return t
        para = ask(db, "Give the proved reserve figure for Jhanjra Block-II.",
                   actor="perf@bench")
        t.note = "paraphrase also hit cache" if para.answer_mode == "cache" else \
                 "exact re-ask hits; paraphrase missed"
        t.samples_ms = _time(lambda: ask(db, seed_q, actor="perf@bench"), iters=15)
    except Exception as exc:  # noqa: BLE001
        t.skipped = True
        t.note = f"error: {exc}"
    return t


def _bench_fresh_llm(db, q: str) -> Timing:
    from app.services.llm.base import LLMUnavailable
    from app.services.rag import ask

    t = Timing("rag.ask fresh — live LLM", FRESH_TARGET_MS)
    os.environ.pop("COALMIND_NARRATIVE_LLM", None)
    try:
        t.samples_ms = _time(
            lambda: ask(db, q, actor="perf@bench", use_cache=False), iters=3, warmup=1
        )
    except LLMUnavailable as exc:
        t.skipped = True
        t.note = f"LLM unavailable ({exc}); fresh-LLM latency not measured"
    except Exception as exc:  # noqa: BLE001
        t.skipped = True
        t.note = f"error: {exc}"
    finally:
        os.environ["COALMIND_NARRATIVE_LLM"] = "0"
    return t


def _bench_report(db, KGEntity, EntityKind) -> Timing:
    from app.services.reports import create_report

    t = Timing("report.create — geological_reserve_status", REPORT_TARGET_MS)
    block = (
        db.query(KGEntity)
        .filter(KGEntity.kind == EntityKind.block)
        .order_by(KGEntity.created_at)
        .first()
    )
    if block is None:
        t.skipped = True
        t.note = "no block entity in the graph; run dev.py build-kg"
        return t
    os.environ["COALMIND_NARRATIVE_LLM"] = "0"
    t.samples_ms = _time(
        lambda: create_report(
            db, template_key="geological_reserve_status",
            params={"block_id": str(block.id)}, actor="perf@bench",
        ),
        iters=5,
    )
    return t


def _bench_ingest_parse() -> Timing:
    from app.services.extraction import extract_fields
    from app.services.ingestion.classifier import classify
    from app.services.ingestion.page_extract import extract_pages

    corpus = Path(__file__).resolve().parents[1] / "ml" / "sample_corpus"
    docs = sorted(p for p in corpus.glob("*.pdf"))
    t = Timing("ingest parse (extract_pages+classify+extract_fields) / doc",
               INGEST_PARSE_TARGET_MS)
    if not docs:
        t.skipped = True
        t.note = "no sample PDFs; run dev.py corpus"
        return t

    def one(path: Path) -> None:
        pages = extract_pages(path.read_bytes(), "application/pdf", filename=path.name)
        dt, _lang, _d = classify("\n".join(p.text for p in pages), filename=path.name)
        extract_fields(dt, pages)

    samples: list[float] = []
    for path in docs:
        samples += _time(lambda p=path: one(p), iters=2, warmup=0)
    t.samples_ms = samples
    return t


# --------------------------------------------------------------------------- #
# in-process load test
# --------------------------------------------------------------------------- #

@dataclass(slots=True)
class LoadResult:
    scenario: str
    concurrency: int
    total: int
    ok: int
    errors: int
    wall_s: float
    latencies_ms: list[float]

    @property
    def rps(self) -> float:
        return round(self.total / self.wall_s, 1) if self.wall_s else 0.0

    def pct(self, q: float) -> float:
        if not self.latencies_ms:
            return 0.0
        s = sorted(self.latencies_ms)
        return round(s[min(len(s) - 1, int(round(q * (len(s) - 1))))], 1)

    def as_dict(self) -> dict:
        return {
            "scenario": self.scenario, "concurrency": self.concurrency,
            "total": self.total, "ok": self.ok, "errors": self.errors,
            "wall_s": round(self.wall_s, 2), "rps": self.rps,
            "p50_ms": self.pct(0.5), "p95_ms": self.pct(0.95), "p99_ms": self.pct(0.99),
        }


async def _load_scenario(app, method: str, path: str, *, json_body=None,
                         concurrency: int, rounds: int, label: str) -> LoadResult:
    import httpx

    lat: list[float] = []
    ok = errors = 0
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://perf") as client:
        async def one() -> None:
            nonlocal ok, errors
            t0 = time.perf_counter()
            try:
                r = await client.request(method, path, json=json_body, timeout=60.0)
                if r.status_code < 500:
                    ok += 1
                else:
                    errors += 1
            except Exception:  # noqa: BLE001
                errors += 1
            lat.append((time.perf_counter() - t0) * 1000.0)

        t0 = time.perf_counter()
        for _ in range(rounds):
            await asyncio.gather(*(one() for _ in range(concurrency)))
        wall = time.perf_counter() - t0
    return LoadResult(label, concurrency, concurrency * rounds, ok, errors, wall, lat)


def run_load(*, concurrency: int = 16, rounds: int = 3) -> list[LoadResult]:
    os.environ["COALMIND_NARRATIVE_LLM"] = "0"  # keep the load test off the live LLM
    from app.main import create_app

    app = create_app()

    async def _all() -> list[LoadResult]:
        return [
            await _load_scenario(app, "GET", "/health",
                                 concurrency=concurrency, rounds=rounds, label="GET /health"),
            await _load_scenario(
                app, "POST", "/query",
                json_body={"question": "What is the proved reserve for Jhanjra Block-II?",
                           "subsidiary_id": None},
                concurrency=concurrency, rounds=rounds, label="POST /query (deterministic)",
            ),
        ]

    return asyncio.run(_all())


# --------------------------------------------------------------------------- #
# reporting
# --------------------------------------------------------------------------- #

def _print_latency(rows: list[Timing]) -> None:
    print("\nlatency  (p95 must be <= target)")
    for t in rows:
        if t.skipped:
            print(f"  --   {t.name:<46} SKIPPED — {t.note}")
            continue
        mark = "ok " if t.ok else "FAIL"
        print(f"  {mark}  {t.name:<46} p50={t.p50:>8.0f}ms  p95={t.p95:>8.0f}ms  "
              f"worst={t.worst:>8.0f}ms  (target {t.target_ms:.0f})")


def _print_load(rows: list[LoadResult]) -> None:
    print("\nload  (in-process ASGI, deterministic answers)")
    for r in rows:
        mark = "ok " if r.errors == 0 else "FAIL"
        print(f"  {mark}  {r.scenario:<30} conc={r.concurrency:<3} n={r.total:<4} "
              f"rps={r.rps:>6}  p50={r.pct(0.5):>7.0f}ms  p95={r.pct(0.95):>7.0f}ms  "
              f"p99={r.pct(0.99):>7.0f}ms  errors={r.errors}")


def main(argv: list[str]) -> int:
    want_lat = "--load" not in argv
    want_load = "--latency" not in argv
    as_json = "--json" in argv

    lat_rows: list[Timing] = []
    load_rows: list[LoadResult] = []
    if want_lat:
        lat_rows = run_latency()
    if want_load:
        load_rows = run_load()

    if as_json:
        print(json.dumps({
            "latency": [t.as_dict() for t in lat_rows],
            "load": [r.as_dict() for r in load_rows],
            "targets": {"cached_ms": CACHED_TARGET_MS, "fresh_ms": FRESH_TARGET_MS},
        }, indent=2))
    else:
        if lat_rows:
            _print_latency(lat_rows)
        if load_rows:
            _print_load(load_rows)
        print()

    lat_ok = all(t.ok for t in lat_rows)
    load_ok = all(r.errors == 0 for r in load_rows)
    return 0 if (lat_ok and load_ok) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
