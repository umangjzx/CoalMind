#!/usr/bin/env python
"""Generate a synthetic corpus of CIL-style documents for development / demo.

Nothing here is real CIL data — every figure is invented — but the structure
mimics the report types CoalMind must handle. Each document gets a matching
``ground_truth/<name>.json`` so the extraction-accuracy benchmark has an answer
key to score against.

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

Doc = tuple[str, dict, list[str]]


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
    c = canvas.Canvas(str(OUT / f"{name}.pdf"), pagesize=A4)
    _page(c, lines, mono=mono)
    c.showPage()
    c.save()


SUB_NAME = {
    "ECL": "EASTERN COALFIELDS LIMITED",
    "SECL": "SOUTH EASTERN COALFIELDS LIMITED",
    "NCL": "NORTHERN COALFIELDS LIMITED",
    "MCL": "MAHANADI COALFIELDS LIMITED",
    "CCL": "CENTRAL COALFIELDS LIMITED",
    "WCL": "WESTERN COALFIELDS LIMITED",
    "BCCL": "BHARAT COKING COAL LIMITED",
}
_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
           "September", "October", "November", "December"]


# --------------------------------------------------------------------------- #
# templated builders
# --------------------------------------------------------------------------- #

def reserve_report(
    name: str, sub: str, mine: str, block: str, seam: str, grade: str,
    as_on: str, proved: float, indicated: float, inferred: float, *, remark: str,
) -> Doc:
    total = round(proved + indicated + inferred, 2)
    d, m, y = as_on.split("-")[::-1][0], as_on[5:7], as_on[:4]
    gt = {
        "doc_type": "geological_reserve_status", "subsidiary": sub, "mine": mine,
        "block": block, "as_on": as_on,
        "fields": {
            "proved_reserve_mt": {"value": proved, "unit": "million_tonnes"},
            "indicated_reserve_mt": {"value": indicated, "unit": "million_tonnes"},
            "inferred_reserve_mt": {"value": inferred, "unit": "million_tonnes"},
            "seam": seam, "avg_grade": grade,
        },
    }
    lines = [
        f"{SUB_NAME[sub]}  (A subsidiary of Coal India Limited)",
        "GEOLOGICAL RESERVE STATUS REPORT",
        "",
        f"Mine / Colliery : {mine} Project",
        f"Block           : {block}",
        f"Principal Seam  : {seam}      Average Grade : {grade}",
        f"Reserves as on  : {d}.{m}.{y}",
        "",
        "  Category            Reserve (Million Tonnes)",
        "  ---------------------------------------------",
        f"  Proved  (Measured)            {proved:>8.2f}",
        f"  Indicated                    {indicated:>8.2f}",
        f"  Inferred                     {inferred:>8.2f}",
        "  ---------------------------------------------",
        f"  Total Geological Reserve     {total:>8.2f}",
        "",
        f"Remarks: {remark}",
    ]
    return name, gt, lines


def mis_report(
    name: str, sub: str, mine: str, ym: str, coal_t: float, coal_a: float,
    ob_t: float, ob_a: float, sr: float, *, reason: str,
) -> Doc:
    y, mo = ym.split("-")
    ach = round(coal_a / coal_t * 100, 1)
    ob_ach = round(ob_a / ob_t * 100, 1)
    gt = {
        "doc_type": "monthly_production_mis", "subsidiary": sub, "mine": mine, "month": ym,
        "fields": {
            "coal_production_lakh_te": {"value": coal_a, "unit": "lakh_tonnes"},
            "target_lakh_te": {"value": coal_t, "unit": "lakh_tonnes"},
            "achievement_pct": {"value": ach, "unit": "percent"},
            "overburden_removal_lakh_cum": {"value": ob_a, "unit": "lakh_cubic_metre"},
        },
    }
    lines = [
        f"{SUB_NAME[sub]}",
        "MONTHLY PRODUCTION / MIS STATEMENT",
        "",
        f"Mine        : {mine}",
        f"Month       : {_MONTHS[int(mo) - 1]} {y}",
        "",
        "  Parameter                     Target     Actual   Ach.%",
        "  ----------------------------------------------------------",
        f"  Coal Production (Lakh Te)     {coal_t:>6.2f}     {coal_a:>6.2f}    {ach:>5.1f}",
        f"  OB Removal (Lakh Cum)         {ob_t:>6.2f}     {ob_a:>6.2f}    {ob_ach:>5.1f}",
        f"  Stripping Ratio (Cum/Te)      {sr:>6.2f}     {sr:>6.2f}        -",
        "",
        f"Reason for shortfall: {reason}",
    ]
    return name, gt, lines


def inspection_note(
    name: str, sub: str, mine: str, date: str, area: str,
    obs: list[str], risk: str, due: str,
) -> Doc:
    d, m, y = date.split("-")[2], date[5:7], date[:4]
    dd, ddm, ddy = due.split("-")[2], due[5:7], due[:4]
    gt = {
        "doc_type": "inspection_report", "subsidiary": sub, "mine": mine, "date": date,
        "fields": {"finding": obs[0], "risk_rating": risk.lower(), "action_due": due},
    }
    lines = [
        f"{SUB_NAME[sub]} — SAFETY INSPECTION NOTE",
        "",
        f"Mine   : {mine}        Date : {d}.{m}.{y}",
        f"Area   : {area}",
        "",
        "Observations:",
        *[f"  {i + 1}. {o}" for i, o in enumerate(obs)],
        "",
        f"Risk rating: {risk.upper()}.  Compliance to be reported by {dd}.{ddm}.{ddy}.",
    ]
    return name, gt, lines


def borehole_log(
    name: str, sub: str, mine: str, block: str, bh_id: str, collar: float,
    depth: float, completed: str, seams: list[tuple[str, float, float, float, str]],
    principal: str, recovery: int,
) -> Doc:
    d, m, y = completed.split("-")[2], completed[5:7], completed[:4]
    gt = {
        "doc_type": "borehole_log_summary", "subsidiary": sub, "mine": mine, "block": block,
        "fields": {
            "borehole_id": bh_id,
            "total_depth_m": {"value": depth, "unit": "metre"},
            "seams_intersected": len(seams),
            "principal_seam": principal,
        },
    }
    lines = [
        f"{SUB_NAME[sub]} — EXPLORATION WING",
        "BOREHOLE LOG SUMMARY",
        "",
        f"Mine         : {mine}",
        f"Block        : {block}",
        f"Borehole ID  : {bh_id}       Collar RL : {collar:.2f} m",
        f"Total Depth  : {depth:.2f} m           Date completed : {d}.{m}.{y}",
        f"Principal Seam : {principal}",
        "",
        "  Seam            From (m)   To (m)   Thickness (m)   Grade",
        "  --------------------------------------------------------------",
        *[f"  {s[0]:<14} {s[1]:>8.2f}  {s[2]:>7.2f}      {s[3]:>6.2f}       {s[4]}"
          for s in seams],
        "",
        f"{len(seams)} workable seams intersected. Core recovery {recovery}%.",
    ]
    return name, gt, lines


# --------------------------------------------------------------------------- #
# the corpus
# --------------------------------------------------------------------------- #

TEMPLATED: list[Doc] = [
    # --- reserve status: several mines, two "as on" dates each -> revision anomalies
    reserve_report("geological_reserve_status_gevra_2020", "SECL", "Gevra", "Gevra Block-I",
                   "Seam-III", "G8", "2020-04-01", 445.2, 128.0, 54.1,
                   remark="Baseline estimate from the 2018-19 exploration campaign."),
    reserve_report("geological_reserve_status_gevra_2023", "SECL", "Gevra", "Gevra Block-I",
                   "Seam-III", "G8", "2023-04-01", 421.8, 119.4, 49.7,
                   remark="Depletion by production and a revised south-east boundary."),
    reserve_report("geological_reserve_status_dipka_2021", "SECL", "Dipka", "Dipka West",
                   "Seam-II", "G9", "2021-04-01", 312.6, 88.4, 30.2,
                   remark="Estimates carried forward from the previous plan period."),
    reserve_report("geological_reserve_status_dipka_2024", "SECL", "Dipka", "Dipka West",
                   "Seam-II", "G9", "2024-04-01", 298.1, 82.0, 27.5,
                   remark="Re-logging of BH-DPK-W-22 to 31; indicated block downgraded."),
    reserve_report("geological_reserve_status_talcher_2019", "MCL", "Talcher",
                   "Talcher Expansion Block-A", "Seam-IV Bottom", "G6", "2019-04-01",
                   690.5, 210.3, 95.8,
                   remark="First full estimate for the expansion block."),
    reserve_report("geological_reserve_status_talcher_2022", "MCL", "Talcher",
                   "Talcher Expansion Block-A", "Seam-IV Bottom", "G6", "2022-04-01",
                   672.0, 198.6, 88.1,
                   remark="Adjusted after the 2021 hydrogeological review."),
    reserve_report("geological_reserve_status_rajmahal_2020", "CCL", "Rajmahal",
                   "Rajmahal Block-B", "Seam-I", "G11", "2020-04-01", 158.9, 44.2, 18.0,
                   remark="Estimate stable since the 2017 assessment."),
    reserve_report("geological_reserve_status_rajmahal_2023", "CCL", "Rajmahal",
                   "Rajmahal Block-B", "Seam-I", "G11", "2023-04-01", 158.9, 44.2, 18.0,
                   remark="No change; carried forward pending fresh drilling."),
    reserve_report("geological_reserve_status_lakhanpur_2022", "MCL", "Lakhanpur",
                   "Lakhanpur OCP", "Seam-V", "G7", "2022-04-01", 205.0, 60.0, 25.0,
                   remark="Initial estimate for the newly notified block."),

    # --- monthly MIS: several mines, three months each
    mis_report("monthly_production_mis_kusmunda_2023_06", "SECL", "Kusmunda Opencast",
               "2023-06", 19.50, 19.12, 44.00, 43.10, 2.25,
               reason="Pre-monsoon dust suppression restrictions on two shifts."),
    mis_report("monthly_production_mis_kusmunda_2023_07", "SECL", "Kusmunda Opencast",
               "2023-07", 19.80, 17.05, 44.50, 39.80, 2.30,
               reason="Heavy rainfall; 6 working days affected by water logging."),
    mis_report("monthly_production_mis_gevra_2023_06", "SECL", "Gevra Opencast",
               "2023-06", 41.00, 40.20, 92.00, 90.10, 2.24,
               reason="Dragline DL-3 planned maintenance shutdown of 30 hours."),
    mis_report("monthly_production_mis_gevra_2023_07", "SECL", "Gevra Opencast",
               "2023-07", 41.50, 36.90, 93.00, 82.40, 2.28,
               reason="Monsoon; haul road at the 210 mRL bench washed out twice."),
    mis_report("monthly_production_mis_gevra_2023_08", "SECL", "Gevra Opencast",
               "2023-08", 42.00, 43.10, 94.00, 95.60, 2.22,
               reason="Recovery month; extra hired HEMM deployed on OB."),
    mis_report("monthly_production_mis_nigahi_2023_07", "NCL", "Nigahi Opencast",
               "2023-07", 17.50, 15.90, 39.00, 35.10, 2.21,
               reason="Belt conveyor BC-3 idler failures; 40 hours lost."),
    mis_report("monthly_production_mis_nigahi_2023_08", "NCL", "Nigahi Opencast",
               "2023-08", 17.00, 16.40, 38.50, 37.20, 2.23,
               reason="Partial recovery after conveyor repairs."),
    mis_report("monthly_production_mis_lakhanpur_2023_07", "MCL", "Lakhanpur OCP",
               "2023-07", 12.00, 11.30, 26.00, 24.40, 2.16,
               reason="Extended monsoon; 4 working days lost to water logging."),
    mis_report("monthly_production_mis_lakhanpur_2023_08", "MCL", "Lakhanpur OCP",
               "2023-08", 12.50, 12.05, 27.00, 26.10, 2.17,
               reason="Two days lost to a crusher gearbox replacement."),
    mis_report("monthly_production_mis_amrapali_2023_08", "CCL", "Amrapali Opencast",
               "2023-08", 9.00, 8.20, 19.50, 17.80, 2.17,
               reason="Land possession dispute stopped work on the western face for 5 days."),

    # --- more inspection notes
    inspection_note(
        "mine_inspection_note_gevra_dragline_2023", "SECL", "Gevra Opencast", "2023-09-05",
        "OB Bench 3, Dragline DL-2 operating radius",
        ["Tail-swing warning barrier missing on the north side of DL-2.",
         "Trailing cable crossing the haul road without a ramp protector.",
         "Fire extinguishers in the operator cabin overdue for pressure testing."],
        "high", "2023-09-20"),
    inspection_note(
        "mine_inspection_note_kusmunda_haulroad_2023", "SECL", "Kusmunda Opencast",
        "2023-10-11", "Main haul road, 150 mRL to 90 mRL ramp",
        ["Road width below the specified 24 m at two curves near the 120 mRL bench.",
         "Berm height inadequate along a 200 m stretch of the descending ramp.",
         "Water tanker frequency insufficient; visible dust at the shovel face."],
        "medium", "2023-10-31"),
    inspection_note(
        "mine_inspection_note_talcher_ug_2024", "MCL", "Talcher Underground", "2024-01-18",
        "5 Level, Seam-IV Bottom district ventilation",
        ["Air quantity at the last cut-through measured 18 percent below the plan.",
         "One stopping in the return airway has a visible leakage path.",
         "Gas detector at the district loading point past its calibration date."],
        "high", "2024-02-02"),

    # --- more borehole logs
    borehole_log(
        "exploration_borehole_log_summary_gevra_2021", "SECL", "Gevra", "Gevra Block-I",
        "BH-GVR-I-112", 268.40, 505.20, "2021-02-27",
        [("Seam-III", 300.55, 312.35, 11.80, "G8"),
         ("Seam-II", 210.10, 214.90, 4.80, "G9"),
         ("Seam-IV", 420.10, 425.60, 5.50, "G7")],
        "Seam-III", 92),
    borehole_log(
        "exploration_borehole_log_summary_rajmahal_2020", "CCL", "Rajmahal",
        "Rajmahal Block-B", "BH-RJM-B-058", 118.90, 288.60, "2020-11-14",
        [("Seam-I", 96.20, 104.40, 8.20, "G11"),
         ("Seam-II", 180.75, 184.10, 3.35, "G10")],
        "Seam-I", 88),
]

# --- hand-written documents (kept verbatim for variety of wording / layout)
HAND: list[Doc] = [
    (
        "geological_reserve_status_jhanjra_2021",
        {
            "doc_type": "geological_reserve_status", "subsidiary": "ECL", "mine": "Jhanjra",
            "block": "Jhanjra Block-II", "as_on": "2021-04-01",
            "fields": {
                "proved_reserve_mt": {"value": 182.4, "unit": "million_tonnes"},
                "indicated_reserve_mt": {"value": 64.1, "unit": "million_tonnes"},
                "inferred_reserve_mt": {"value": 21.7, "unit": "million_tonnes"},
                "seam": "R-VII", "avg_grade": "G6",
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
        "geological_reserve_status_jhanjra_2023",
        {
            "doc_type": "geological_reserve_status", "subsidiary": "ECL", "mine": "Jhanjra",
            "block": "Jhanjra Block-II", "as_on": "2023-04-01",
            "fields": {
                "proved_reserve_mt": {"value": 176.5, "unit": "million_tonnes"},
                "indicated_reserve_mt": {"value": 61.8, "unit": "million_tonnes"},
                "inferred_reserve_mt": {"value": 19.4, "unit": "million_tonnes"},
                "seam": "R-VII", "avg_grade": "G6",
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
    (
        "monthly_production_mis_kusmunda_2023_08",
        {
            "doc_type": "monthly_production_mis", "subsidiary": "SECL", "mine": "Kusmunda OC",
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
            "doc_type": "parliamentary_qa_response", "subsidiary": "CIL",
            "reference": "Starred Question No. 312", "date": "2024-07-25",
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
        "parliament_qa_response_draft_2024_unstarred_1187",
        {
            "doc_type": "parliamentary_qa_response", "subsidiary": "CIL",
            "reference": "Unstarred Question No. 1187", "date": "2024-03-12",
            "fields": {
                "question_topic": "overburden removal and stripping ratio trend in SECL",
                "cil_production_mt_fy24": {"value": 773.6, "unit": "million_tonnes"},
                "cil_target_mt_fy24": {"value": 780.0, "unit": "million_tonnes"},
            },
        },
        [
            "GOVERNMENT OF INDIA / MINISTRY OF COAL",
            "RAJYA SABHA — DRAFT REPLY (for approval)",
            "",
            "Unstarred Question No. 1187   To be answered on 12.03.2024",
            "",
            "Subject: Overburden removal and stripping ratio trend in SECL",
            "",
            "(a) CIL coal production in FY 2023-24 was 773.60 MT against a target of",
            "    780.00 MT.",
            "(b) The average stripping ratio in SECL opencast mines has remained close",
            "    to 2.25 Cum/Te over the last three years.",
            "",
            "NOTE: subsidiary-wise annexure to be attached before finalisation.",
        ],
    ),
    (
        "mine_inspection_note_conveyor_2023",
        {
            "doc_type": "inspection_report", "subsidiary": "NCL", "mine": "Nigahi OC",
            "date": "2023-11-14",
            "fields": {
                "finding": "Multiple seized carrying idlers near the conveyor drive head.",
                "risk_rating": "high", "action_due": "2023-11-30",
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
            "doc_type": "borehole_log_summary", "subsidiary": "MCL", "mine": "Talcher",
            "block": "Talcher Expansion Block-A",
            "fields": {
                "borehole_id": "BH-TAL-A-047",
                "total_depth_m": {"value": 412.5, "unit": "metre"},
                "seams_intersected": 3, "principal_seam": "Seam-IV Bottom",
            },
        },
        [
            "MAHANADI COALFIELDS LIMITED — EXPLORATION WING",
            "BOREHOLE LOG SUMMARY",
            "",
            "Mine         : Talcher",
            "Block        : Talcher Expansion Block-A",
            "Borehole ID  : BH-TAL-A-047       Collar RL : 78.20 m",
            "Total Depth  : 412.50 m           Date completed : 09.12.2019",
            "Principal Seam : Seam-IV Bottom",
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
            "doc_type": "correspondence", "subsidiary": "WCL", "quality": "degraded_scan",
            "fields": {
                "subject": "Revision of reserve estimate - manganiferous horizon, Wani North",
                "mine": "Wani North", "reference_no": "WCL/GEO/1998/337",
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
]

HINDI_DOC = (
    "monthly_production_mis_nigahi_2023_09_hindi",
    {
        "doc_type": "monthly_production_mis", "subsidiary": "NCL", "language": "hi",
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
    docs = HAND + TEMPLATED
    print(f"generating sample corpus in {OUT}")
    for name, gt, lines in docs:
        mono = "scanned" in name or gt.get("quality") == "degraded_scan"
        make_pdf(name, lines, mono=mono)
        (GT / f"{name}.json").write_text(json.dumps(gt, indent=2), encoding="utf-8")

    h_name, h_gt, h_text = HINDI_DOC
    (OUT / f"{h_name}.txt").write_text(h_text + "\n", encoding="utf-8")
    (GT / f"{h_name}.json").write_text(
        json.dumps(h_gt, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"done: {len(docs)} PDFs + 1 text doc + ground-truth JSON")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
