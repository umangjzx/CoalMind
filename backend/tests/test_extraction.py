from __future__ import annotations

from app.services.extraction import extract_fields
from app.services.extraction.rules import extract_by_rules
from app.services.ingestion.page_extract import Page, Word

RESERVE_TEXT = """EASTERN COALFIELDS LIMITED
GEOLOGICAL RESERVE STATUS REPORT
Mine / Colliery : Jhanjra Underground Project
Block           : Jhanjra Block-II
Principal Seam  : R-VII      Average Grade : G6
Reserves as on  : 01.04.2021
  Proved  (Measured)            182.40
  Indicated                      64.10
  Inferred                       21.70
  Total Geological Reserve      268.20
"""


def _page(text: str) -> Page:
    words = [Word(tok, i * 10.0, 100.0, i * 10.0 + 8, 110.0) for i, tok in enumerate(text.split())]
    return Page(1, 595.0, 842.0, "pt", "pdf_text", text, words)


def _by_key(cands):
    return {c.field_key: c for c in cands}


def test_reserve_rules_extract_expected_values():
    cands = extract_by_rules("geological_reserve_status", [_page(RESERVE_TEXT)])
    by = _by_key(cands)
    assert by["proved_reserve"].value_json["value"] == 182.40
    assert by["indicated_reserve"].value_json["value"] == 64.10
    assert by["inferred_reserve"].value_json["value"] == 21.70
    assert by["total_geological_reserve"].value_json["value"] == 268.20
    assert by["principal_seam"].value_text == "R-VII"
    assert by["average_grade"].value_text == "G6"
    assert by["reserves_as_on"].value_json["iso"] == "2021-04-01"


def test_reserve_fields_are_high_confidence_and_traced():
    cands = extract_by_rules("geological_reserve_status", [_page(RESERVE_TEXT)])
    proved = _by_key(cands)["proved_reserve"]
    assert proved.confidence >= 0.75
    assert proved.page_no == 1
    assert proved.source_snippet  # a snippet was captured
    assert proved.value_json["unit"] == "million_tonnes"


def test_validation_flags_reserve_total_mismatch():
    bad = RESERVE_TEXT.replace("268.20", "300.00")
    cands, notes = extract_fields("geological_reserve_status", [_page(bad)])
    assert any("categories sum to" in n for n in notes)
    total = _by_key(cands)["total_geological_reserve"]
    assert any("sum to" in x for x in total.notes)
    assert total.confidence < 0.9  # confidence was damped by the mismatch


def test_ocr_page_damps_confidence():
    words = [
        Word(tok, i * 10.0, 100.0, i * 10.0 + 8, 110.0, ocr_conf=0.55)
        for i, tok in enumerate(RESERVE_TEXT.split())
    ]
    ocr_page = Page(1, 800.0, 1000.0, "px", "ocr", RESERVE_TEXT, words, dpi=200)
    text_cands = _by_key(extract_by_rules("geological_reserve_status", [_page(RESERVE_TEXT)]))
    ocr_cands = _by_key(extract_by_rules("geological_reserve_status", [ocr_page]))
    assert ocr_cands["proved_reserve"].confidence < text_cands["proved_reserve"].confidence
