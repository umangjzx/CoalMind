"""How the system was validated — extraction accuracy, performance, test coverage.

The extraction figures are computed live from the sample corpus + its ground
truth (no DB). Performance figures are the last measured `dev.py perf` run and
the test counts are static; both are cheap to keep current by hand.
"""

from __future__ import annotations

import importlib.util
import sys
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from app.schemas.validation import ValidationSummary

router = APIRouter(tags=["validation"])

_REPO = Path(__file__).resolve().parents[4]  # backend/app/api/routes/ -> repo root
_HARNESS = _REPO / "scripts" / "eval_extraction.py"

_TTL_S = 300.0
_lock = threading.Lock()
_cache: tuple[float, dict] | None = None


def _run_eval() -> dict:
    if not _HARNESS.exists():
        return {}
    spec = importlib.util.spec_from_file_location("eval_extraction", _HARNESS)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["eval_extraction"] = mod
    spec.loader.exec_module(mod)
    if not (mod.GROUND_TRUTH.exists() and any(mod.GROUND_TRUTH.glob("*.json"))):
        return {}
    return mod.run()


# performance: PRD NFR §9 target vs the last measured `dev.py perf` run
_PERFORMANCE: list[dict[str, Any]] = [
    {"path": "Cached / verified answer", "p50_ms": 72, "p95_ms": 120,
     "target_ms": 5000, "prd": True},
    {"path": "Fresh answer (with the AI model)", "p50_ms": 2054, "p95_ms": 2946,
     "target_ms": 20000, "prd": True},
    {"path": "Fresh answer (offline / deterministic)", "p50_ms": 116, "p95_ms": 127,
     "target_ms": 4000, "prd": False},
    {"path": "Graph + passage retrieval", "p50_ms": 66, "p95_ms": 121,
     "target_ms": 3000, "prd": False},
    {"path": "Anomaly scan (whole graph)", "p50_ms": 104, "p95_ms": 122,
     "target_ms": 6000, "prd": False},
    {"path": "Report draft", "p50_ms": 100, "p95_ms": 105,
     "target_ms": 12000, "prd": False},
    {"path": "Audit-chain verification", "p50_ms": 48, "p95_ms": 192,
     "target_ms": 4000, "prd": False},
]

_LOAD = {
    "concurrency": 16,
    "query_p95_ms": 367,
    "query_rps": 43.2,
    "health_p95_ms": 1075,
    "errors": 0,
}

_TESTS = {
    "backend": 80,
    "frontend_build": True,
    "notes": "pytest + ruff on every backend change; tsc + eslint + vite build on the frontend.",
}

_METHOD = [
    "Extraction is scored against a hand-written ground-truth file per sample "
    "document — the value an ideal reader would record for every field.",
    "A value counts as correct within 0.5% for numbers, on an exact date match, "
    "or an abbreviation-aware text match ('Kusmunda OC' = 'Kusmunda Opencast').",
    "'Effective accuracy after review' = 1 − (silent errors + silent misses) / N: "
    "a silent error is a wrong value auto-accepted above the confidence threshold; "
    "a silent miss is a ground-truth field never extracted. Both escape the review "
    "queue — everything else a person catches.",
    "Performance is measured by driving the service layer directly (warm model) and "
    "by firing concurrent requests at the app through an in-process transport — no "
    "network, no external load tool.",
    "The corpus here is synthetic: realistic in structure, not real CIL data.",
]


def _summary() -> dict:
    global _cache
    now = time.monotonic()
    if _cache and now - _cache[0] < _TTL_S:
        return _cache[1]
    with _lock:
        if _cache and time.monotonic() - _cache[0] < _TTL_S:
            return _cache[1]
        report = _run_eval()
        out = {
            "extraction": report,
            "performance": _PERFORMANCE,
            "load": _LOAD,
            "tests": _TESTS,
            "methodology": _METHOD,
        }
        _cache = (time.monotonic(), out)
        return out


@router.get("/validation/summary", response_model=ValidationSummary)
def validation_summary() -> ValidationSummary:
    return ValidationSummary(**_summary())
