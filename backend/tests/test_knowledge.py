"""M2 knowledge layer — chunker/normalize (unit) + resolver/queries (DB-backed)."""

from __future__ import annotations

import hashlib
import uuid

import pytest

from app.models import (
    Document,
    DocumentStatus,
    EntityKind,
    ExtractionField,
    FieldStatus,
    KGEntity,
    KGRelation,
    Predicate,
)
from app.services.ingestion.page_extract import Page
from app.services.knowledge.chunker import chunk_pages
from app.services.knowledge.normalize import norm_key

# --- unit ---------------------------------------------------------------------

def test_norm_key_strips_filler():
    assert norm_key("Jhanjra Underground Project") == "jhanjra"
    assert norm_key("Kusmunda OC") == "kusmunda"
    assert norm_key("The Talcher Colliery") == "talcher"


def test_chunker_splits_and_overlaps():
    long_text = ". ".join(f"sentence number {i} about coal reserves" for i in range(40))
    pages = [Page(1, 0, 0, "pt", "pdf_text", long_text, [])]
    chunks = chunk_pages(pages, target_chars=200, overlap_chars=40)
    assert len(chunks) > 3
    assert all(c.page_no == 1 for c in chunks)
    assert all(len(c.text) <= 320 for c in chunks)  # target + overlap slack


def test_chunker_keeps_page_numbers():
    pages = [
        Page(1, 0, 0, "pt", "pdf_text", "first page text about mines", []),
        Page(2, 0, 0, "pt", "pdf_text", "second page text about seams", []),
    ]
    chunks = chunk_pages(pages)
    assert {c.page_no for c in chunks} == {1, 2}


# --- DB-backed --------------------------------------------------------------

@pytest.fixture
def reserve_doc(db_or_skip):
    db = db_or_skip
    raw = f"kg-{uuid.uuid4()}".encode()
    doc = Document(
        original_filename="kg_reserve.pdf",
        content_type="application/pdf",
        sha256=hashlib.sha256(raw).hexdigest(),
        storage_key="docs/kg/kg_reserve.pdf",
        size_bytes=len(raw),
        status=DocumentStatus.ready,
        doc_type="geological_reserve_status",
    )
    db.add(doc)
    db.flush()

    def field(key, label, text, vj, conf=0.9, status=FieldStatus.auto_accepted, et=None):
        f = ExtractionField(
            document_id=doc.id, field_key=key, label=label, value_text=text,
            original_value_text=text, value_json=vj, entity_type=et,
            confidence=conf, status=status,
        )
        db.add(f)
        return f

    field("mine_name", "Mine", "Jhanjra Underground Project", None, et="Mine")
    field("block_name", "Block", "Jhanjra Block-II", None, et="Block")
    field("principal_seam", "Seam", "R-VII", None, et="Seam")
    field("average_grade", "Grade", "G6", None, et="Mineral")
    field("reserves_as_on", "As on", "2021-04-01", {"iso": "2021-04-01"})
    field("proved_reserve", "Proved", "182.40", {"value": 182.4, "unit": "million_tonnes"})
    field("indicated_reserve", "Indicated", "64.10", {"value": 64.1, "unit": "million_tonnes"})
    field("inferred_reserve", "Inferred", "21.70", {"value": 21.7, "unit": "million_tonnes"})
    db.commit()
    yield doc
    for tbl in (KGRelation, KGEntity):
        db.query(tbl).filter_by(document_id=doc.id).delete()
    db.query(ExtractionField).filter_by(document_id=doc.id).delete()
    db.query(Document).filter_by(id=doc.id).delete()
    db.commit()


def test_resolver_builds_reserve_graph(db_or_skip, reserve_doc):
    from app.services.knowledge.resolver import resolve_document

    resolve_document(db_or_skip, reserve_doc)
    db_or_skip.commit()

    ents = db_or_skip.query(KGEntity).filter_by(document_id=reserve_doc.id).all()
    kinds = {e.kind for e in ents}
    assert EntityKind.reserve in kinds and EntityKind.report in kinds

    rels = db_or_skip.query(KGRelation).filter_by(document_id=reserve_doc.id).all()
    preds = {r.predicate for r in rels}
    assert Predicate.has_reserve in preds
    assert Predicate.reported_in in preds  # the traceability edge

    proved = next(
        e for e in ents
        if e.kind == EntityKind.reserve and e.attrs.get("category") == "proved"
    )
    assert proved.attrs["quantity"] == 182.4
    assert proved.source_field_id is not None  # provenance kept

    # has_reserve edge is temporally stamped with the "as on" date
    has_res = [r for r in rels if r.predicate == Predicate.has_reserve]
    assert all(r.valid_from and r.valid_from.isoformat() == "2021-04-01" for r in has_res)


def test_resolver_is_idempotent(db_or_skip, reserve_doc):
    from app.services.knowledge.resolver import resolve_document

    resolve_document(db_or_skip, reserve_doc)
    db_or_skip.commit()
    n1 = db_or_skip.query(KGRelation).filter_by(document_id=reserve_doc.id).count()
    resolve_document(db_or_skip, reserve_doc)
    db_or_skip.commit()
    n2 = db_or_skip.query(KGRelation).filter_by(document_id=reserve_doc.id).count()
    assert n1 == n2 and n1 > 0


def test_neighbors_and_subgraph(db_or_skip, reserve_doc):
    from app.services.knowledge import queries as kq
    from app.services.knowledge.resolver import resolve_document

    resolve_document(db_or_skip, reserve_doc)
    db_or_skip.commit()

    # shared named entities may predate this doc, so find the block via the subgraph
    sg = kq.document_subgraph(db_or_skip, reserve_doc.id)
    assert len(sg["entities"]) >= 6 and len(sg["relations"]) >= 6

    block = next(e for e in sg["entities"] if e.kind == EntityKind.block)
    nbrs = kq.neighbors(db_or_skip, block.id)
    assert any(n.entity.kind == EntityKind.reserve for n in nbrs)
    assert any(n.entity.kind == EntityKind.mine for n in nbrs)


def test_resolver_only_uses_accepted_fields(db_or_skip, reserve_doc):
    from app.services.knowledge.resolver import resolve_document

    # a needs_review mention must NOT enter the graph
    db_or_skip.add(
        ExtractionField(
            document_id=reserve_doc.id, field_key="mention_seam", label="Seam (mention)",
            value_text="XYZ-99", original_value_text="XYZ-99", confidence=0.4,
            status=FieldStatus.needs_review, entity_type="Seam",
        )
    )
    db_or_skip.commit()
    resolve_document(db_or_skip, reserve_doc)
    db_or_skip.commit()

    # the needs_review mention must not have produced a graph node anywhere
    assert (
        db_or_skip.query(KGEntity)
        .filter(KGEntity.kind == EntityKind.seam, KGEntity.name == "XYZ-99")
        .count()
        == 0
    )
