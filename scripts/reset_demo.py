#!/usr/bin/env python
"""Clean the demo database back to a presentable state.

    python scripts/dev.py reset-demo

Removes:
  * documents that are not part of ml/sample_corpus/ (stray uploads that pollute
    search, the word cloud and RAG retrieval), plus their graph nodes + chunks
  * duplicate reports (keeps the most recent per title)
  * duplicate Q&A history rows (keeps the most recent per question)
then rebuilds the knowledge graph, topics and anomaly scan and re-hashes the
audit chain so everything is consistent again.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from sqlalchemy import select

from app.audit import rehash_chain
from app.core.db import SessionLocal
from app.models import (
    Anomaly,
    DocChunk,
    Document,
    ExtractionField,
    KGEntity,
    KGRelation,
    QAPair,
    Report,
    ReportVersion,
)

CORPUS = Path(__file__).resolve().parents[1] / "ml" / "sample_corpus"


def _corpus_names() -> set[str]:
    return {p.name for p in CORPUS.iterdir() if p.is_file() and p.suffix in {".pdf", ".txt"}}


def main() -> int:
    keep = _corpus_names()
    db = SessionLocal()
    removed_docs = dup_reports = dup_qa = 0
    try:
        # --- stray documents -------------------------------------------------
        for doc in db.execute(select(Document)).scalars().all():
            if doc.original_filename in keep:
                continue
            db.query(KGRelation).filter_by(document_id=doc.id).delete(synchronize_session=False)
            db.query(KGEntity).filter_by(document_id=doc.id).delete(synchronize_session=False)
            db.query(DocChunk).filter_by(document_id=doc.id).delete(synchronize_session=False)
            db.query(ExtractionField).filter_by(document_id=doc.id).delete(synchronize_session=False)
            db.query(Document).filter_by(id=doc.id).delete(synchronize_session=False)
            removed_docs += 1

        # --- duplicate reports (keep newest per title) ---------------------
        seen: set[str] = set()
        for r in db.execute(
            select(Report).order_by(Report.created_at.desc())
        ).scalars().all():
            if r.title in seen:
                db.query(ReportVersion).filter_by(report_id=r.id).delete(synchronize_session=False)
                db.query(Report).filter_by(id=r.id).delete(synchronize_session=False)
                dup_reports += 1
            else:
                seen.add(r.title)

        # --- duplicate Q&A (keep newest per question) --------------------
        seen_q: set[str] = set()
        for qa in db.execute(
            select(QAPair).order_by(QAPair.created_at.desc())
        ).scalars().all():
            if qa.question in seen_q:
                db.query(QAPair).filter_by(id=qa.id).delete(synchronize_session=False)
                dup_qa += 1
            else:
                seen_q.add(qa.question)

        db.query(Anomaly).delete(synchronize_session=False)
        db.commit()
        print(f"removed  {removed_docs} stray document(s)  ·  "
              f"{dup_reports} duplicate report(s)  ·  {dup_qa} duplicate Q&A row(s)")
    finally:
        db.close()

    # --- rebuild derived data ----------------------------------------------
    from app.models import Document as _Doc
    from app.services.anomaly import scan_anomalies
    from app.services.knowledge import build_knowledge
    from app.services.topics import rebuild_topics

    with SessionLocal() as db:
        ids = [row[0] for row in db.query(_Doc.id).all()]
    for doc_id in ids:
        build_knowledge(doc_id, actor="system")
    with SessionLocal() as db:
        print("topics:", rebuild_topics(db=db))
        db.commit()
    with SessionLocal() as db:
        print("anomalies:", scan_anomalies(db))
        db.commit()
    with SessionLocal() as db:
        print("audit chain:", rehash_chain(db))

    print("\n[ok] demo database reset")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
