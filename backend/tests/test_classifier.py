from __future__ import annotations

import pytest

from app.services.ingestion.classifier import classify, detect_language

CASES = [
    ("GEOLOGICAL RESERVE STATUS REPORT\nProved 182.40 Indicated 64.10 Inferred 21.70"
     " million tonnes", "geological_reserve_status"),
    ("MONTHLY PRODUCTION / MIS STATEMENT\nCoal Production (Lakh Te) target"
     " achievement overburden", "monthly_production_mis"),
    ("LOK SABHA — DRAFT REPLY\nStarred Question No. 312  To be answered on 25.07.2024",
     "parliamentary_qa_response"),
    ("SAFETY INSPECTION NOTE\nObservations: seized idlers. Risk rating: HIGH."
     " Compliance by 30.11.2023", "inspection_report"),
    ("BOREHOLE LOG SUMMARY\nBorehole ID BH-TAL-A-047  Collar RL 78.20 m"
     "  Core recovery 94%", "borehole_log_summary"),
    ("Sub: Revision of reserve estimate\nWith reference to the note of the Regional Geologist",
     "correspondence"),
]


@pytest.mark.parametrize("text,expected", CASES)
def test_classify_doc_type(text, expected):
    doc_type, _lang, _date = classify(text)
    assert doc_type == expected


def test_classify_unknown_when_no_signal():
    doc_type, _, _ = classify("the quick brown fox jumps over the lazy dog")
    assert doc_type == "unknown"


def test_classify_extracts_as_on_date():
    _, _, dt = classify("Reserves as on : 01.04.2021")
    assert dt is not None and dt.year == 2021 and dt.month == 4


def test_detect_language():
    assert detect_language("plain english text") == "en"
    assert detect_language("यह हिंदी पाठ है और अधिक शब्द") == "hi"
