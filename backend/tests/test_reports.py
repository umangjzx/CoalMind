"""M3 report engine — mdblocks round-trip (unit) + full lifecycle (DB-backed)."""

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
    Report,
    ReportStatus,
    ReportVersion,
)
from app.services.reports.engine import (
    ReportError,
    add_human_edit,
    create_report,
    finalize_report,
    rerender_report,
    version_diff,
)
from app.services.reports.mdblocks import md_to_blocks
from app.services.reports.render import blocks_to_markdown, to_docx, to_pdf

# --- unit -------------------------------------------------------------------

def test_md_to_blocks_roundtrip():
    md = (
        "# Title\n\n"
        "- **Subsidiary:** ECL\n- **Block:** Jhanjra Block-II\n\n"
        "| Category | Reserve |\n| --- | --- |\n| Proved | 182.4 mt [1] |\n\n"
        "A summary paragraph with a citation [1].\n"
    )
    blocks = md_to_blocks(md)
    kinds = [b["type"] for b in blocks]
    assert kinds == ["heading", "kv", "table", "paragraph"]
    assert blocks[1]["items"][0] == {"label": "Subsidiary", "value": "ECL"}
    assert blocks[2]["rows"] == [["Proved", "182.4 mt [1]"]]


def test_md_to_blocks_drops_sources_section():
    md = "# T\n\nBody.\n\n---\n\n**Sources**\n\n[1] doc.pdf, p.1\n"
    blocks = md_to_blocks(md)
    assert not any(b["type"] == "heading" and b["text"].lower() == "sources" for b in blocks)


def test_blocks_to_markdown_renders_markers_and_sources():
    blocks = [
        {"type": "heading", "level": 1, "text": "R"},
        {"type": "table", "columns": ["A", "B"], "rows": [["x", "y [[c:1]]"]]},
    ]
    cites = [{"marker": 1, "document_filename": "d.pdf", "page_no": 2,
              "snippet": "s", "confidence": 0.9}]
    md = blocks_to_markdown(blocks, cites)
    assert "y [1]" in md and "**Sources**" in md and "d.pdf, p.2" in md


# --- DB-backed ------------------------------------------------------------

@pytest.fixture
def graph_block(db_or_skip):
    """A block entity with reserve fact-source fields, wired into the graph."""
    db = db_or_skip
    raw = f"rpt-{uuid.uuid4()}".encode()
    doc = Document(
        original_filename="rpt_reserve.pdf", content_type="application/pdf",
        sha256=hashlib.sha256(raw).hexdigest(), storage_key="docs/rpt/x.pdf",
        size_bytes=len(raw), status=DocumentStatus.ready, doc_type="geological_reserve_status",
    )
    db.add(doc)
    db.flush()

    fields = {}
    for key, val, num in [
        ("proved_reserve", "182.40", 182.4),
        ("indicated_reserve", "64.10", 64.1),
        ("inferred_reserve", "21.70", 21.7),
        ("total_geological_reserve", "268.20", 268.2),
    ]:
        f = ExtractionField(
            document_id=doc.id, field_key=key, label=key.replace("_", " ").title(),
            value_text=val, original_value_text=val,
            value_json={"value": num, "unit": "million_tonnes"},
            page_no=1, confidence=0.93, status=FieldStatus.auto_accepted,
        )
        db.add(f)
        db.flush()
        fields[key] = f

    block = KGEntity(kind=EntityKind.block, name="RPT Test Block",
                     normalized_key=f"rpt-{uuid.uuid4()}", document_id=doc.id, confidence=0.9)
    report_node = KGEntity(kind=EntityKind.report, name=doc.original_filename,
                           normalized_key=f"report:{doc.id}", document_id=doc.id)
    db.add_all([block, report_node])
    db.flush()
    db.add(KGRelation(src_id=block.id, dst_id=report_node.id, predicate=Predicate.reported_in,
                      document_id=doc.id))
    db.commit()
    yield block, doc, fields
    db.query(KGRelation).filter_by(document_id=doc.id).delete()
    db.query(KGEntity).filter_by(document_id=doc.id).delete()
    for r in db.query(Report).filter(Report.title.like("%RPT Test Block%")).all():
        db.query(ReportVersion).filter_by(report_id=r.id).delete()
        db.delete(r)
    db.query(ExtractionField).filter_by(document_id=doc.id).delete()
    db.query(Document).filter_by(id=doc.id).delete()
    db.commit()


def test_report_cites_every_reserve_figure(db_or_skip, graph_block):
    block, _doc, _fields = graph_block
    r = create_report(db_or_skip, template_key="geological_reserve_status",
                      params={"block_id": str(block.id)}, actor="officer@cmpdi.co.in")
    v = db_or_skip.get(ReportVersion, r.current_version_id)
    assert r.status == ReportStatus.draft
    assert len(v.citations) == 4
    assert {c["field_key"] for c in v.citations} == {
        "proved_reserve", "indicated_reserve", "inferred_reserve", "total_geological_reserve"
    }
    assert all(c["page_no"] == 1 for c in v.citations)
    assert v.unresolved == []


def test_needs_review_field_blocks_finalize(db_or_skip, graph_block):
    block, _doc, fields = graph_block
    fields["proved_reserve"].status = FieldStatus.needs_review
    db_or_skip.commit()

    r = create_report(db_or_skip, template_key="geological_reserve_status",
                      params={"block_id": str(block.id)}, actor="officer@cmpdi.co.in")
    v = db_or_skip.get(ReportVersion, r.current_version_id)
    assert r.status == ReportStatus.in_review
    assert any(u["field_key"] == "proved_reserve" for u in v.unresolved)

    with pytest.raises(ReportError, match="need verification"):
        finalize_report(db_or_skip, r, actor="officer@cmpdi.co.in")

    # verify the field -> re-render -> now finalisable
    fields["proved_reserve"].status = FieldStatus.verified
    db_or_skip.commit()
    rerender_report(db_or_skip, r, actor="officer@cmpdi.co.in")
    db_or_skip.refresh(r)
    assert r.status == ReportStatus.draft
    finalize_report(db_or_skip, r, actor="officer@cmpdi.co.in")
    db_or_skip.refresh(r)
    assert r.status == ReportStatus.final and r.finalized_at is not None


def test_human_edit_creates_provenance_and_diff(db_or_skip, graph_block):
    block, _doc, _fields = graph_block
    r = create_report(db_or_skip, template_key="geological_reserve_status",
                      params={"block_id": str(block.id)}, actor="officer@cmpdi.co.in")
    v1 = db_or_skip.get(ReportVersion, r.current_version_id)
    add_human_edit(db_or_skip, r, content_md=v1.content_md + "\n\n_Verified by officer._",
                   summary="officer note", actor="geologist@ccl.co.in")

    versions = db_or_skip.query(ReportVersion).filter_by(report_id=r.id).order_by(
        ReportVersion.version_no
    ).all()
    assert [x.version_no for x in versions] == [1, 2]
    assert versions[0].author_kind == "ai" and versions[1].author_kind == "human"

    d = version_diff(db_or_skip, r, 1, 2)
    assert d["from"]["author_kind"] == "ai" and d["to"]["author_kind"] == "human"
    assert "Verified by officer" in d["unified"]


def test_export_pdf_and_docx(db_or_skip, graph_block):
    block, _doc, _fields = graph_block
    r = create_report(db_or_skip, template_key="geological_reserve_status",
                      params={"block_id": str(block.id)}, actor="officer@cmpdi.co.in")
    v = db_or_skip.get(ReportVersion, r.current_version_id)
    payload = {"blocks": v.blocks, "citations": v.citations, "title": r.title}
    from app.services.reports.render import render_html

    pdf = to_pdf(render_html(payload, report_title=r.title))
    docx = to_docx(payload, report_title=r.title)
    assert pdf.startswith(b"%PDF") and len(pdf) > 800
    assert docx[:2] == b"PK" and len(docx) > 5000
