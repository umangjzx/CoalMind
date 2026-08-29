"""M4 query & response — normalize/compose (unit) + RAG + cache (DB-backed)."""

from __future__ import annotations

import hashlib
import uuid

import pytest

from app.models import (
    DocChunk,
    Document,
    DocumentStatus,
    EntityKind,
    ExtractionField,
    FieldStatus,
    KGEntity,
    KGRelation,
    Predicate,
    QAPair,
    QAStatus,
)
from app.services.rag.answer import compose_answer
from app.services.rag.cache import normalize_question
from app.services.rag.retrieve import Evidence, Retrieval

# --- unit -----------------------------------------------------------------

def test_normalize_question():
    assert normalize_question("  What ARE the reserves, exactly? ") == (
        "what are the reserves exactly"
    )


def test_compose_declines_when_no_evidence():
    ans = compose_answer(Retrieval(question="anything"))
    assert ans.status == "insufficient"
    assert "Nothing was retrieved" in ans.answer_md


def test_compose_declines_below_floor():
    r = Retrieval(question="q", passages=[Evidence(kind="passage", text="weak", score=0.2)])
    assert compose_answer(r).status == "insufficient"


def test_compose_deterministic_mode_keeps_markers(monkeypatch):
    monkeypatch.setenv("COALMIND_NARRATIVE_LLM", "0")
    r = Retrieval(
        question="q",
        facts=[Evidence(kind="fact", text="Jhanjra: proved = 182.4 million tonnes",
                        score=0.93, source_field_id=str(uuid.uuid4()))],
    )
    ans = compose_answer(r)
    assert ans.status == "answered" and "[[c:1]]" in ans.answer_md
    assert ans.confidence >= 0.75


# --- DB-backed ----------------------------------------------------------

@pytest.fixture
def rag_corpus(db_or_skip):
    db = db_or_skip
    raw = f"rag-{uuid.uuid4()}".encode()
    doc = Document(
        original_filename="rag_reserve.pdf", content_type="application/pdf",
        sha256=hashlib.sha256(raw).hexdigest(), storage_key="docs/rag/x.pdf",
        size_bytes=len(raw), status=DocumentStatus.ready, doc_type="geological_reserve_status",
    )
    db.add(doc)
    db.flush()

    f = ExtractionField(
        document_id=doc.id, field_key="proved_reserve", label="Proved reserve",
        value_text="182.40", original_value_text="182.40",
        value_json={"value": 182.4, "unit": "million_tonnes"},
        page_no=1, confidence=0.93, status=FieldStatus.auto_accepted,
    )
    db.add(f)
    db.flush()

    block = KGEntity(kind=EntityKind.block, name="Zzq Test Block",
                     normalized_key=f"zzq test block {uuid.uuid4().hex[:4]}",
                     document_id=doc.id, confidence=0.9)
    reserve = KGEntity(kind=EntityKind.reserve, name="Proved reserve",
                       normalized_key=f"reserve:{doc.id}:proved", document_id=doc.id,
                       source_field_id=f.id, confidence=0.93,
                       attrs={"category": "proved", "quantity": 182.4, "unit": "million_tonnes"})
    db.add_all([block, reserve])
    db.flush()
    db.add(KGRelation(src_id=block.id, dst_id=reserve.id, predicate=Predicate.has_reserve,
                      document_id=doc.id, source_field_id=f.id))

    from app.services.embeddings import get_embedder
    emb = get_embedder()
    text = "Zzq Test Block proved geological reserve is 182.40 million tonnes as on 2021."
    db.add(DocChunk(document_id=doc.id, chunk_index=0, page_no=1, text=text,
                    char_count=len(text), embedding=emb.embed_one(text), embed_model="test"))
    db.commit()
    yield doc, block, f
    db.query(KGRelation).filter_by(document_id=doc.id).delete()
    db.query(KGEntity).filter_by(document_id=doc.id).delete()
    db.query(DocChunk).filter_by(document_id=doc.id).delete()
    db.query(QAPair).filter(QAPair.question.like("%Zzq Test Block%")).delete(
        synchronize_session=False
    )
    db.query(ExtractionField).filter_by(document_id=doc.id).delete()
    db.query(Document).filter_by(id=doc.id).delete()
    db.commit()


def test_ask_fact_backed_question(db_or_skip, rag_corpus):
    from app.services.rag import ask

    _doc, _block, f = rag_corpus
    qa = ask(db_or_skip, "What is the proved reserve for Zzq Test Block?",
             actor="officer@cmpdi.co.in", use_cache=False)
    assert qa.status == QAStatus.answered
    assert qa.confidence >= 0.75  # fact-backed
    assert any(c.get("extraction_field_id") == str(f.id) for c in qa.citations)
    assert "[[c:" in qa.answer_md


def test_ask_declines_when_nothing_relevant(db_or_skip, rag_corpus):
    from app.services.rag import ask

    # far outside the mining-report domain -> retrieval floor -> decline (FR-8)
    qa = ask(db_or_skip, "Give me a recipe for a mango banana breakfast smoothie.",
             actor="officer@cmpdi.co.in", use_cache=False)
    assert qa.status == QAStatus.insufficient
    assert "not enough confident evidence" in qa.answer_md.lower() or "No source" in qa.answer_md


def test_cache_hit_after_verify(db_or_skip, rag_corpus):
    from app.services.rag import ask, promote_answer

    q1 = ask(db_or_skip, "What is the proved reserve for Zzq Test Block?",
             actor="officer@cmpdi.co.in", use_cache=False)
    promote_answer(db_or_skip, q1.id, actor="officer@cmpdi.co.in")

    q2 = ask(db_or_skip, "proved reserve of the Zzq Test Block please",
             actor="officer@cmpdi.co.in")
    assert q2.answer_mode == "cache"
    assert q2.answer_md == q1.answer_md

    db_or_skip.refresh(q1)
    assert q1.hit_count >= 1

    from app.models.audit import AuditEvent

    assert (
        db_or_skip.query(AuditEvent)
        .filter(AuditEvent.action == "query.cache_hit", AuditEvent.target_id == str(q1.id))
        .count()
        >= 1
    )


def test_reject_answer(db_or_skip, rag_corpus):
    from app.services.rag import ask, reject_answer

    qa = ask(db_or_skip, "What is the proved reserve for Zzq Test Block?",
             actor="officer@cmpdi.co.in", use_cache=False)
    reject_answer(db_or_skip, qa.id, actor="officer@cmpdi.co.in")
    db_or_skip.refresh(qa)
    assert qa.status == QAStatus.rejected
