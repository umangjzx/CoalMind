"""CLI: ingest local files through the same store + pipeline the API uses.

    uv run python -m app.workers.ingest_cli path/to/file.pdf [more ...]
    uv run python -m app.workers.ingest_cli --samples      # the ml/sample_corpus/ set
"""

from __future__ import annotations

import mimetypes
import sys
from pathlib import Path

from app.core.db import SessionLocal
from app.services.ingestion.pipeline import run_pipeline
from app.services.ingestion.store import ingest_bytes

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLES = REPO_ROOT / "ml" / "sample_corpus"


def _ingest_one(path: Path, actor: str) -> None:
    data = path.read_bytes()
    ct = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    with SessionLocal() as db:
        res = ingest_bytes(db, data=data, filename=path.name, content_type=ct, actor=actor)
        doc_id = res.document.id
        tag = "new" if res.created else "dedup"
    print(f"  [{tag}] {path.name} -> {doc_id}")
    if res.created:
        run_pipeline(doc_id, actor=actor)
    with SessionLocal() as db:
        doc = db.get(type(res.document), doc_id)
        p = (doc.meta or {}).get("pipeline", {})
        print(f"        type={doc.doc_type} status={doc.status} "
              f"fields={p.get('fields_extracted', 0)} review={p.get('fields_needs_review', 0)}")


def _reprocess_all(actor: str) -> int:
    from app.models import Document, DocumentStatus

    with SessionLocal() as db:
        ids = [row[0] for row in db.query(Document.id).all()]
    print(f"re-processing {len(ids)} document(s)")
    for doc_id in ids:
        with SessionLocal() as db:
            doc = db.get(Document, doc_id)
            doc.status = DocumentStatus.received
            db.commit()
        run_pipeline(doc_id, actor=actor)
    return 0


def main(argv: list[str]) -> int:
    actor = "system"
    if argv and argv[0] in {"--reprocess", "-r"}:
        return _reprocess_all(actor)
    if not argv or argv[0] in {"--samples", "-s"}:
        paths = sorted(SAMPLES.glob("*.pdf"))
        if not paths:
            print("no sample PDFs — run: python scripts/dev.py corpus")
            return 1
    else:
        paths = [Path(a) for a in argv]

    print(f"ingesting {len(paths)} file(s)")
    for path in paths:
        if not path.exists():
            print(f"  !! missing: {path}")
            continue
        _ingest_one(path, actor)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
