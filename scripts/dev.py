#!/usr/bin/env python
"""Cross-platform task runner for CoalMind (no `make` needed on Windows).

    python scripts/dev.py up        # start Postgres + MinIO (docker compose)
    python scripts/dev.py down      # stop them
    python scripts/dev.py migrate   # alembic upgrade head
    python scripts/dev.py seed      # load subsidiaries + demo users
    python scripts/dev.py corpus    # generate the synthetic sample corpus
    python scripts/dev.py ingest-samples  # push ml/sample_corpus/ through the pipeline
    python scripts/dev.py anomalies  # (re)scan the KG for historical-vs-new inconsistencies
    python scripts/dev.py eval       # score classification + field extraction vs ground truth
    python scripts/dev.py perf       # latency bench + in-process load test vs PRD NFRs
    python scripts/dev.py api       # run the FastAPI dev server (reload)
    python scripts/dev.py web       # run the Vite dev server
    python scripts/dev.py test      # backend pytest
    python scripts/dev.py lint      # ruff (backend) + eslint (frontend)
    python scripts/dev.py bootstrap # up + migrate + seed + corpus
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"

# npm on Windows shells that lack ComSpec chokes on lifecycle scripts; be defensive.
ENV = {**os.environ}
ENV.setdefault("ComSpec", r"C:\Windows\System32\cmd.exe")


def run(cmd: list[str], cwd: Path = ROOT) -> int:
    print(f"\n$ {' '.join(cmd)}  (cwd={cwd.relative_to(ROOT) if cwd != ROOT else '.'})")
    return subprocess.call(cmd, cwd=cwd, env=ENV)


def uv(*args: str, cwd: Path = BACKEND) -> int:
    return run(["uv", "run", *args], cwd=cwd)


TASKS = {
    "up": lambda: run(["docker", "compose", "up", "-d"]),
    "down": lambda: run(["docker", "compose", "down"]),
    "migrate": lambda: uv("alembic", "upgrade", "head"),
    "seed": lambda: uv("python", str(ROOT / "scripts" / "seed_db.py")),
    "corpus": lambda: uv("python", str(ROOT / "scripts" / "gen_sample_corpus.py")),
    "api": lambda: uv(
        "uvicorn", "app.main:app", "--reload",
        "--host", os.environ.get("API_HOST", "0.0.0.0"),
        "--port", os.environ.get("API_PORT", "8000"),
    ),
    "web": lambda: run(["npm", "run", "dev"], cwd=FRONTEND),
    "ingest-samples": lambda: uv("python", "-m", "app.workers.ingest_cli", "--samples"),
    "build-kg": lambda: uv("python", "-m", "app.workers.ingest_cli", "--build-kg"),
    "topics": lambda: uv("python", "-c",
                         "from app.services.topics import rebuild_topics as r; print(r())"),
    "anomalies": lambda: uv("python", "-c",
                            "from app.services.anomaly import scan_anomalies as s; print(s())"),
    "eval": lambda: uv("python", str(ROOT / "scripts" / "eval_extraction.py")),
    "perf": lambda: uv("python", str(ROOT / "scripts" / "perf_bench.py")),
    "audit-rehash": lambda: uv("python", "-c",
                               "from app.core.db import SessionLocal; from app.audit import "
                               "rehash_chain as r; d=SessionLocal(); print(r(d)); d.close()"),
    "test": lambda: uv("pytest", "-q"),
    "lint": lambda: (uv("ruff", "check", ".") or run(["npm", "run", "lint"], cwd=FRONTEND)),
}


def bootstrap() -> int:
    for name in ("up", "migrate", "seed", "corpus"):
        code = TASKS[name]()
        if code != 0:
            return code
    print("\n✓ bootstrap complete — now run:  python scripts/dev.py api"
          "   (and 'web' in another shell)")
    return 0


TASKS["bootstrap"] = bootstrap


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in TASKS:
        print(__doc__)
        return 1
    return TASKS[sys.argv[1]]() or 0


if __name__ == "__main__":
    raise SystemExit(main())
