#!/usr/bin/env python
"""Generate a small synthetic corpus of CIL-style documents for development.

Nothing here is real CIL data — figures are invented — but the structure mimics
the report types CoalMind must handle. Each document gets a matching
``ground_truth/<name>.json`` describing the fields an ideal extractor should
return, so M1+ accuracy benchmarks have something to score against.

    python scripts/dev.py corpus
"""

from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parents[1] / "ml" / "sample_corpus"
GT = OUT / "ground_truth"


def _page(c: canvas.Canvas, lines: list[str], *, mono: bool = False) -> None:
    c.setFont("Courier" if mono else "Helvetica", 10.5)
    x, y = 22 * mm, 275 * mm
    for line in lines:
        if y < 20 * mm:
            c.showPage()
            c.setFont("Courier" if mono else "Helvetica", 10.5)
            y = 275 * mm
        c.drawString(x, y, line)
        y -= 6 * mm


def make_pdf(name: str, lines: list[str], *, mono: bool = False) -> None:
    path = OUT / f"{name}.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    _page(c, lines, mono=mono)
    c.showPage()
    c.save()
    print(f"  wrote {path.relative_to(OUT.parent.parent)}")


DOCS: list[tuple[str, dict, list[str]]] = [
    (
        "geological_reserve_status_jhanjra_2021",
        {
            "doc_type": "geological_reserve_status",
            "subsidiary": "ECL",
            "mine": "Jhanjra",
            "block": "Jhanjra Block-II",
            "as_on": "2021-04-01",
            "fields": {
                "proved_reserve_mt": {"value": 182.4, "unit": "million_tonnes"},
                "indicated_reserve_mt": {"value": 64.1, "unit": "million_tonnes"},
                "inferred_reserve_mt": {"value": 21.7, "unit": "million_tonnes"},
                "seam": "R-VII",
                "avg_grade": "G6",
            },
        },
        [
            "EASTERN COALFIELDS LIMITED  (A subsidiary of Coal India Limited)",
            "GEOLOGICAL RESERVE STATUS REPORT",
            "",
            "Mine / Colliery : Jhanjra Underground Project",
            "Block           : Jhanjra Block-II",
            "Principal Seam  : R-VII      Average Grade : G6",
            "Reserves as on  : 01.04.2021",
            "",
            "  Category            Reserve (Million Tonnes)",
            "  ---------------------------------------------",
            "  Proved  (Measured)            182.40",
            "  Indicated                      64.10",
            "  Inferred                       21.70",
            "  ---------------------------------------------",
            "  Total Geological Reserve      268.20",
            "",
            "Remarks: Estimates revised after 2019 borehole re-logging (BH-JH-114 to 131).",
        ],
    ),
    (
        "monthly_production_mis_kusmunda_2023_08",
        {
            "doc_type": "monthly_production_mis",
            "subsidiary": "SECL",
            "mine": "Kusmunda OC",
            "month": "2023-08",
            "fields": {
                "coal_production_lakh_te": {"value": 18.63, "unit": "lakh_tonnes"},
                "target_lakh_te": {"value": 20.00, "unit": "lakh_tonnes"},
                "achievement_pct": {"value": 93.2, "unit": "percent"},
                "overburden_removal_lakh_cum": {"value": 41.9, "unit": "lakh_cubic_metre"},
            },
        },
        [
            "SOUTH EASTERN COALFIELDS LIMITED",
            "MONTHLY PRODUCTION / MIS STATEMENT",
            "",
            "Mine        : Kusmunda Opencast",
            "Month       : August 2023",
            "",
            "  Parameter                     Target     Actual   Ach.%",
            "  ----------------------------------------------------------",
            "  Coal Production (Lakh Te)      20.00      18.63     93.2",
            "  OB Removal (Lakh Cum)          45.00      41.90     93.1",
            "  Stripping Ratio (Cum/Te)       2.25       2.25        -",
            "",
            "Reason for shortfall: extended monsoon; 4 working days lost to water logging.",
        ],
    ),
    (
        "parliament_qa_response_draft_2024_starred_312",
        {
            "doc_type": "parliamentary_qa_response",
            "subsidiary": "CIL",
            "reference": "Starred Question No. 312",
            "date": "2024-07-25",
            "fields": {
                "question_topic": "coal production shortfall in eastern subsidiaries",
                "cil_production_mt_fy24": {"value": 773.6, "unit": "million_tonnes"},
                "cil_target_mt_fy24": {"value": 780.0, "unit": "million_tonnes"},
            },
        },
        [
            "GOVERNMENT OF INDIA / MINISTRY OF COAL",
            "LOK SABHA — DRAFT REPLY (for approval)",
            "",
            "Starred Question No. 312   To be answered on 25.07.2024",
            "",
            "Subject: Coal production shortfall in eastern subsidiaries",
            "",
            "(a) CIL coal production in FY 2023-24 was 773.60 MT against a target of",
            "    780.00 MT, an achievement of 99.2 percent.",
            "(b) Subsidiary-wise shortfall was most pronounced in ECL and BCCL owing to",
            "    land acquisition delays and monsoon impact.",
            "",
            "NOTE: figures to be reconciled with Coal Controller data before finalisation.",
        ],
    ),
    (
        "mine_inspection_note_conveyor_2023",
        {
            "doc_type": "inspection_report",
            "subsidiary": "NCL",
            "mine": "Nigahi OC",
            "date": "2023-11-14",
            "fields": {
                "finding": "Multiple seized carrying idlers near the conveyor drive head.",
                "risk_rating": "high",
                "action_due": "2023-11-30",
            },
        },
        [
            "NORTHERN COALFIELDS LIMITED — SAFETY INSPECTION NOTE",
            "",
            "Mine   : Nigahi Opencast        Date : 14.11.2023",
            "Area   : Coal Handling Plant, Belt Conveyor BC-3",
            "",
            "Observations:",
            "  1. Multiple seized carrying idlers near the conveyor drive head.",
            "  2. Heavy coal spillage along 60 m of the conveyor gallery.",
            "  3. Pull-cord switch on north side non-functional.",
            "",
            "Risk rating: HIGH.  Compliance to be reported by 30.11.2023.",
        ],
    ),
    (
        "exploration_borehole_log_summary_talcher_2019",
        {
            "doc_type": "borehole_log_summary",
            "subsidiary": "MCL",
            "mine": "Talcher",
            "block": "Talcher Expansion Block-A",
            "fields": {
                "borehole_id": "BH-TAL-A-047",
                "total_depth_m": {"value": 412.5, "unit": "metre"},
                "seams_intersected": 3,
                "principal_seam": "Seam-IV Bottom",
            },
        },
        [
            "MAHANADI COALFIELDS LIMITED — EXPLORATION WING",
            "BOREHOLE LOG SUMMARY",
            "",
            "Block        : Talcher Expansion Block-A",
            "Borehole ID  : BH-TAL-A-047       Collar RL : 78.20 m",
            "Total Depth  : 412.50 m           Date completed : 09.12.2019",
            "",
            "  Seam            From (m)   To (m)   Thickness (m)   Grade",
            "  --------------------------------------------------------------",
            "  Seam-III         188.40    191.10        2.70        G8",
            "  Seam-IV Top      264.05    268.90        4.85        G7",
            "  Seam-IV Bottom   270.10    276.35        6.25        G6",
            "",
            "3 workable seams intersected. Core recovery 94%.",
        ],
    ),
    (
        "scanned_correspondence_degraded_1998",
        {
            "doc_type": "correspondence",
            "subsidiary": "WCL",
            "quality": "degraded_scan",
            "fields": {
                "subject": "Revision of reserve estimate - manganiferous horizon, Wani North",
                "mine": "Wani North",
                "reference_no": "WCL/GEO/1998/337",
                "letter_date": "1998-08-03",
                "revised_value": {"value": 1.42, "unit": "million_tonnes"},
                "superseded_value": {"value": 1.15, "unit": "million_tonnes"},
                "note": "OCR expected to be poor; routes to human review queue",
            },
        },
        [
            "WESTERN COALFIELDS LTD    No. WCL/GEO/1998/337    Dt. 03-AUG-1998",
            "",
            "Sub:  Revision of reserve estimate - manganiferous horizon, Wani North",
            "",
            "With reference to the note of the Regional Geologist, the reserve",
            "figure for the manganiferous horizon at Wani North is revised from",
            "1.42 MT to 1.15 MT following re-survey of the eastern fault block.",
            "The earlier 1994 estimate is superseded.",
            "",
            "                                        (Chief Geologist)",
        ],
    ),
    (
        # a LATER reserve status for the same block — figures revised down.
        # This creates a cross-document "revision" anomaly (FR-14).
        "geological_reserve_status_jhanjra_2023",
        {
            "doc_type": "geological_reserve_status",
            "subsidiary": "ECL",
            "mine": "Jhanjra",
            "block": "Jhanjra Block-II",
            "as_on": "2023-04-01",
            "fields": {
                "proved_reserve_mt": {"value": 176.5, "unit": "million_tonnes"},
                "indicated_reserve_mt": {"value": 61.8, "unit": "million_tonnes"},
                "inferred_reserve_mt": {"value": 19.4, "unit": "million_tonnes"},
                "seam": "R-VII",
                "avg_grade": "G6",
            },
        },
        [
            "EASTERN COALFIELDS LIMITED  (A subsidiary of Coal India Limited)",
            "GEOLOGICAL RESERVE STATUS REPORT",
            "",
            "Mine / Colliery : Jhanjra Underground Project",
            "Block           : Jhanjra Block-II",
            "Principal Seam  : R-VII      Average Grade : G6",
            "Reserves as on  : 01.04.2023",
            "",
            "  Category            Reserve (Million Tonnes)",
            "  ---------------------------------------------",
            "  Proved  (Measured)            176.50",
            "  Indicated                      61.80",
            "  Inferred                       19.40",
            "  ---------------------------------------------",
            "  Total Geological Reserve      257.70",
            "",
            "Remarks: Depletion by production FY22-FY23 and boundary re-adjustment.",
        ],
    ),
]

# --- a Hindi / English document (FR-11). Written as UTF-8 text so it needs no
#     Devanagari font or Hindi OCR pack to demo.
HINDI_DOC = (
    "monthly_production_mis_nigahi_2023_09_hindi",
    {
        "doc_type": "monthly_production_mis",
        "subsidiary": "NCL",
        "language": "hi",
        "mine": "Nigahi",
        "fields": {
            "coal_production_lakh_te": {"value": 15.2, "unit": "lakh_tonnes"},
            "target_lakh_te": {"value": 17.0, "unit": "lakh_tonnes"},
        },
    },
    "\n".join([
        "नॉर्दर्न कोलफील्ड्स लिमिटेड — मासिक उत्पादन विवरण",
        "",
        "खान (Mine): Nigahi Opencast",
        "माह (Month): September 2023",
        "",
        "  पैरामीटर                     लक्ष्य     वास्तविक",
        "  Coal Production (Lakh Te)      17.00      15.20",
        "  Achievement (%)                  -        89.4",
        "",
        "टिप्पणी: भारी वर्षा के कारण कोयला उत्पादन में कमी रही। "
        "क्रशर संयंत्र की मरम्मत के कारण दो दिन कार्य बाधित रहा।",
    ]),
)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    GT.mkdir(parents=True, exist_ok=True)
    print(f"generating sample corpus in {OUT}")
    for name, gt, lines in DOCS:
        mono = "scanned" in name or gt.get("quality") == "degraded_scan"
        make_pdf(name, lines, mono=mono)
        (GT / f"{name}.json").write_text(json.dumps(gt, indent=2), encoding="utf-8")

    # Hindi/English doc — plain UTF-8 text (reportlab has no Devanagari font).
    h_name, h_gt, h_text = HINDI_DOC
    (OUT / f"{h_name}.txt").write_text(h_text + "\n", encoding="utf-8")
    (GT / f"{h_name}.json").write_text(json.dumps(h_gt, indent=2, ensure_ascii=False),
                                      encoding="utf-8")
    print(f"  wrote sample_corpus/{h_name}.txt")

    print(f"done: {len(DOCS)} PDFs + 1 text doc + ground-truth JSON")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
