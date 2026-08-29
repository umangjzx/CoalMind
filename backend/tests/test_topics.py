"""M5 topics & word cloud — normalize/model (unit) + build/wordcloud/trends (DB-backed)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime

import pytest

from app.models import DocChunk, Document, DocumentStatus, ExtractionField, FieldStatus
from app.services.topics.model import ModelInput, fit_topics
from app.services.topics.normalize import canon, tokenize

# --- unit -----------------------------------------------------------------

def test_canon_folds_variants():
    assert canon("Khadan") == "mine"
    assert canon("colliery") == "mine"
    assert canon("reserves") == "reserve"
    assert canon("utpadan") == "production"


def test_tokenize_drops_domain_stopwords_keeps_hindi():
    toks = tokenize("Coal India Limited report on the खदान seam khadan colliery")
    assert "coal" not in toks and "limited" not in toks and "report" not in toks
    assert toks.count("mine") == 2  # khadan + colliery both -> mine
    assert "खदान" in toks  # devanagari retained


def test_fit_topics_separates_themes():
    data = ModelInput(
        document_ids=["a", "b", "c", "d"],
        texts=[
            "belt conveyor idler damage safety inspection risk rating high",
            "conveyor gallery spillage pull cord switch safety hazard",
            "proved indicated inferred geological reserve estimate million tonnes block",
            "reserve revision manganiferous horizon estimate superseded geologist",
        ],
    )
    topics, engine = fit_topics(data, n_topics=2)
    assert engine == "nmf" and len(topics) == 2
    joined = [" ".join(t["term"] for t in tp.terms) for tp in topics]
    assert any("conveyor" in j for j in joined)
    assert any("reserve" in j for j in joined)


# --- DB-backed --------------------------------------------------------

@pytest.fixture
def topic_corpus(db_or_skip):
    db = db_or_skip
    from app.services.embeddings import get_embedder

    emb = get_embedder()
    docs = []
    seeds = [
        ("tp_conveyor.pdf", "inspection_report", datetime(2023, 11, 14),
         "Belt conveyor BC-3 idler damage and coal spillage. Risk rating HIGH. "
         "Pull cord switch non functional in the mine gallery."),
        ("tp_reserve.pdf", "geological_reserve_status", datetime(2021, 4, 1),
         "Proved geological reserve 182.4 million tonnes, indicated 64.1, inferred 21.7 "
         "for the block. Principal seam R-VII grade G6."),
        ("tp_prod.pdf", "monthly_production_mis", datetime(2023, 8, 1),
         "Coal production 18.63 lakh tonnes against target 20.0, achievement 93 percent. "
         "Shortfall due to monsoon working days lost."),
    ]
    for name, dtype, ddate, text in seeds:
        raw = f"{name}-{uuid.uuid4()}".encode()
        d = Document(original_filename=name, content_type="application/pdf",
                     sha256=hashlib.sha256(raw).hexdigest(), storage_key=f"docs/tp/{name}",
                     size_bytes=len(raw), status=DocumentStatus.ready, doc_type=dtype,
                     doc_date=ddate)
        db.add(d)
        db.flush()
        db.add(DocChunk(document_id=d.id, chunk_index=0, page_no=1, text=text,
                        char_count=len(text), embedding=emb.embed_one(text), embed_model="t"))
        db.add(ExtractionField(document_id=d.id, field_key="k", label="k", value_text="v",
                               original_value_text="v", source_snippet=text[:120],
                               confidence=0.9, status=FieldStatus.auto_accepted))
        docs.append(d)
    db.commit()
    yield docs
    from app.models import TopicDoc

    ids = [d.id for d in docs]
    db.query(TopicDoc).filter(TopicDoc.document_id.in_(ids)).delete(synchronize_session=False)
    db.query(DocChunk).filter(DocChunk.document_id.in_(ids)).delete(synchronize_session=False)
    db.query(ExtractionField).filter(ExtractionField.document_id.in_(ids)).delete(
        synchronize_session=False
    )
    db.query(Document).filter(Document.id.in_(ids)).delete(synchronize_session=False)
    db.commit()


def test_word_frequencies_filter_by_type(db_or_skip, topic_corpus):
    from app.services.topics import word_frequencies

    allw = {i["term"] for i in word_frequencies(db_or_skip)}
    assert "conveyor" in allw and "reserve" in allw and "coal" not in allw

    prod = {i["term"] for i in word_frequencies(db_or_skip, doc_type="monthly_production_mis")}
    assert "production" in prod and "conveyor" not in prod


def test_rebuild_topics_and_trends(db_or_skip, topic_corpus):
    from app.models.audit import AuditEvent
    from app.services.topics import list_topics, rebuild_topics, trends

    stats = rebuild_topics(db=db_or_skip, n_topics=3)
    db_or_skip.commit()
    assert stats["topics"] >= 2 and stats["engine"] == "nmf"

    topics = list_topics(db_or_skip)
    assert topics and all(t.terms for t in topics)
    assert sum(t.doc_count for t in topics) >= 3  # every doc placed

    tr = trends(db_or_skip)
    assert tr["buckets"] and tr["series"]
    assert all(len(s["counts"]) == len(tr["buckets"]) for s in tr["series"])

    assert (
        db_or_skip.query(AuditEvent).filter(AuditEvent.action == "topics.rebuilt").count() >= 1
    )


def test_ensure_summary_fills_deterministically(db_or_skip, topic_corpus, monkeypatch):
    monkeypatch.setenv("COALMIND_NARRATIVE_LLM", "0")
    from app.services.topics import ensure_summary, list_topics, rebuild_topics

    rebuild_topics(db=db_or_skip, n_topics=3)
    db_or_skip.commit()
    t = list_topics(db_or_skip)[0]
    assert not t.summary
    ensure_summary(db_or_skip, t)
    assert t.summary and "theme" in t.summary.lower()
