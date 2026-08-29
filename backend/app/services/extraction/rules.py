"""Table-driven, per-doc-type field extraction.

Each `Spec` is a labelled regex with one capture group. The engine runs every spec
for the document's type across all pages, and for the first solid match builds a
`FieldCandidate` carrying page number, bounding box and a source snippet. Confidence
starts from `base_conf` and is damped for OCR pages and shaky matches
(see `confidence.score`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from dateutil import parser as dateparser

from app.services.extraction.confidence import score
from app.services.extraction.gazetteer import canon_unit
from app.services.extraction.locate import bbox_for, snippet_for
from app.services.extraction.types import FieldCandidate
from app.services.ingestion.page_extract import Page

_NUM = r"(\d[\d,]*\.?\d*)"


@dataclass(slots=True)
class Spec:
    field_key: str
    label: str
    pattern: str
    kind: str = "number"          # number | text | date
    entity_type: str | None = None
    unit: str | None = None
    base_conf: float = 0.9
    flags: int = re.IGNORECASE


SPECS: dict[str, list[Spec]] = {
    "geological_reserve_status": [
        Spec("proved_reserve", "Proved / measured reserve",
             rf"proved[^\n]*?{_NUM}", unit="million_tonnes", entity_type="Reserve", base_conf=0.93),
        Spec("indicated_reserve", "Indicated reserve", rf"indicated[^\n]*?{_NUM}",
             unit="million_tonnes", entity_type="Reserve", base_conf=0.93),
        Spec("inferred_reserve", "Inferred reserve", rf"inferred[^\n]*?{_NUM}",
             unit="million_tonnes", entity_type="Reserve", base_conf=0.93),
        Spec("total_geological_reserve", "Total geological reserve",
             rf"total geological reserve[^\n]*?{_NUM}", unit="million_tonnes",
             entity_type="Reserve", base_conf=0.9),
        Spec("principal_seam", "Principal seam",
             r"(?:principal seam|seam)\s*[:\-]?\s*([A-Z]-[IVXLC]{1,4}|Seam[-\s]?[IVXLC0-9]+)",
             kind="text", entity_type="Seam", base_conf=0.85),
        Spec("average_grade", "Average grade",
             r"(?:average grade|grade)\s*[:\-]?\s*(G-?\d{1,2})",
             kind="text", entity_type="Mineral", base_conf=0.85),
        Spec("reserves_as_on", "Reserves as on",
             r"reserves as on\s*[:\-]?\s*([0-3]?\d[./-][0-1]?\d[./-](?:19|20)\d\d)",
             kind="date", base_conf=0.9),
        Spec("mine_name", "Mine / colliery",
             r"(?:mine|colliery)\s*(?:/\s*colliery)?\s*[:\-]\s*([^\n]{3,60})",
             kind="text", entity_type="Mine", base_conf=0.8),
        Spec("block_name", "Block",
             r"block\s*[:\-]\s*([^\n]{3,60})", kind="text", entity_type="Block", base_conf=0.8),
    ],
    "monthly_production_mis": [
        Spec("coal_production_actual", "Coal production (actual)",
             rf"coal production[^\n]*?{_NUM}\s+{_NUM}", unit="lakh_tonnes",
             entity_type="ProductionFigure", base_conf=0.88),
        Spec("ob_removal_actual", "OB removal (actual)",
             rf"ob removal[^\n]*?{_NUM}\s+{_NUM}", unit="lakh_cubic_metre",
             entity_type="ProductionFigure", base_conf=0.85),
        Spec("stripping_ratio", "Stripping ratio",
             rf"stripping ratio[^\n]*?{_NUM}", unit="cubic_metre_per_tonne", base_conf=0.8),
        Spec("month", "Month",
             r"month\s*[:\-]\s*([A-Za-z]+\s+(?:19|20)\d\d)", kind="date", base_conf=0.9),
        Spec("mine_name", "Mine",
             r"mine\s*[:\-]\s*([^\n]{3,60})", kind="text", entity_type="Mine", base_conf=0.8),
        Spec("shortfall_reason", "Reason for shortfall",
             r"reason (?:for )?shortfall\s*[:\-]\s*([^\n]{5,140})", kind="text", base_conf=0.7),
    ],
    "parliamentary_qa_response": [
        Spec("question_reference", "Question reference",
             r"((?:starred|unstarred) question no\.?\s*\d+)", kind="text",
             entity_type="Inquiry", base_conf=0.9),
        Spec("answer_date", "To be answered on",
             r"answered on\s*[:\-]?\s*([0-3]?\d[./-][0-1]?\d[./-](?:19|20)\d\d)",
             kind="date", base_conf=0.9),
        Spec("subject", "Subject",
             r"subject\s*[:\-]\s*([^\n]{5,140})", kind="text", base_conf=0.8),
        Spec("cil_production", "CIL coal production",
             rf"cil (?:coal )?production[^\n]*?{_NUM}\s*mt", unit="million_tonnes",
             entity_type="ProductionFigure", base_conf=0.85),
        Spec("cil_target", "CIL production target",
             rf"target of\s*{_NUM}\s*mt", unit="million_tonnes",
             entity_type="ProductionFigure", base_conf=0.82),
    ],
    "inspection_report": [
        Spec("mine_name", "Mine",
             r"mine\s*[:\-]\s*([^\n]{3,60})", kind="text", entity_type="Mine", base_conf=0.8),
        Spec("inspection_date", "Inspection date",
             r"date\s*[:\-]?\s*([0-3]?\d[./-][0-1]?\d[./-](?:19|20)\d\d)",
             kind="date", base_conf=0.85),
        Spec("area", "Area inspected",
             r"area\s*[:\-]\s*([^\n]{3,80})", kind="text", base_conf=0.75),
        Spec("risk_rating", "Risk rating",
             r"risk rating\s*[:\-]?\s*(high|medium|low|critical)", kind="text", base_conf=0.9),
        Spec("action_due", "Compliance / action due",
             r"(?:compliance|reported) by\s*([0-3]?\d[./-][0-1]?\d[./-](?:19|20)\d\d)",
             kind="date", base_conf=0.8),
    ],
    "borehole_log_summary": [
        Spec("borehole_id", "Borehole ID",
             r"borehole id\s*[:\-]?\s*(BH[-/][A-Z0-9-]+)", kind="text",
             entity_type="Block", base_conf=0.9),
        Spec("collar_rl_m", "Collar RL",
             rf"collar rl\s*[:\-]?\s*{_NUM}", unit="metre", base_conf=0.85),
        Spec("total_depth_m", "Total depth",
             rf"total depth\s*[:\-]?\s*{_NUM}", unit="metre", base_conf=0.9),
        Spec("date_completed", "Date completed",
             r"date completed\s*[:\-]?\s*([0-3]?\d[./-][0-1]?\d[./-](?:19|20)\d\d)",
             kind="date", base_conf=0.88),
        Spec("block_name", "Block",
             r"block\s*[:\-]\s*([^\n]{3,60})", kind="text", entity_type="Block", base_conf=0.8),
        Spec("core_recovery_pct", "Core recovery",
             rf"core recovery\s*{_NUM}\s*%", unit="percent", base_conf=0.8),
    ],
    "correspondence": [
        Spec("reference_no", "Reference number",
             r"no\.?\s*([A-Z]{2,6}[/-][A-Za-z0-9/\-]+)", kind="text", base_conf=0.75),
        Spec("letter_date", "Letter date",
             r"(?:dt\.?|dated)\s*([0-3]?\d[-./][A-Za-z0-9]{2,9}[-./](?:19|20)?\d\d)",
             kind="date", base_conf=0.7),
        Spec("subject", "Subject",
             r"sub(?:ject)?\s*[:\-]\s*([^\n]{5,140})", kind="text", base_conf=0.8),
        Spec("revised_value", "Revised figure",
             rf"revised from\s*{_NUM}\s*mt", unit="million_tonnes",
             entity_type="Reserve", base_conf=0.75),
        Spec("superseded_value", "Superseded figure",
             rf"to\s*{_NUM}\s*mt", unit="million_tonnes", entity_type="Reserve", base_conf=0.6),
    ],
}


def _to_number(raw: str) -> float | None:
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


def _run_spec(spec: Spec, pages: list[Page]) -> FieldCandidate | None:
    rx = re.compile(spec.pattern, spec.flags)
    for page in pages:
        m = rx.search(page.text)
        if not m:
            continue
        raw = m.group(m.lastindex or 1).strip()
        value_json: dict | None = None
        value_text = raw

        if spec.kind == "number":
            num = _to_number(raw)
            if num is None:
                continue
            value_text = raw
            value_json = {"value": num}
            if spec.unit:
                value_json["unit"] = canon_unit(spec.unit)
        elif spec.kind == "date":
            try:
                dt = dateparser.parse(raw, dayfirst=True, fuzzy=True)
                value_json = {"iso": dt.date().isoformat()}
                value_text = dt.date().isoformat()
            except (ValueError, OverflowError):
                value_json = None
        else:  # text
            value_text = re.sub(r"\s+", " ", raw).strip(" .:-")

        conf = score(spec.base_conf, page=page, matched=m.group(0), value=raw)
        return FieldCandidate(
            field_key=spec.field_key,
            label=spec.label,
            value_text=value_text,
            value_json=value_json,
            entity_type=spec.entity_type,
            extractor=f"rule:{spec.field_key}",
            source_kind=page.source_kind,
            page_no=page.page_no,
            bbox=bbox_for(page, raw),
            source_snippet=snippet_for(page, m.group(0)),
            confidence=conf,
        )
    return None


def extract_by_rules(doc_type: str, pages: list[Page]) -> list[FieldCandidate]:
    out: list[FieldCandidate] = []
    for spec in SPECS.get(doc_type, []):
        cand = _run_spec(spec, pages)
        if cand is not None:
            out.append(cand)
    return out
