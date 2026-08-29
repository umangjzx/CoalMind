"""Lightweight rule-based document classifier.

Returns `(doc_type, language, doc_date)`. Deliberately transparent keyword scoring
rather than a model — it is auditable, needs no training data, and is easy for a
CIL analyst to extend per subsidiary. A learned classifier can slot in behind the
same signature later.
"""

from __future__ import annotations

import re
from datetime import datetime

from dateutil import parser as dateparser

# doc_type -> (weighted keyword, weight). Hindi/Devanagari aliases (FR-11) are
# listed alongside the English cues so a Hindi or mixed document scores the same.
_RULES: dict[str, list[tuple[str, int]]] = {
    "geological_reserve_status": [
        ("geological reserve", 5), ("reserve status", 4), ("proved", 2), ("indicated", 2),
        ("inferred", 2), ("geological reserve status report", 8), ("million tonnes", 1),
        ("भूवैज्ञानिक", 5), ("भंडार", 4), ("कोयला भंडार", 5), ("निक्षेप", 3),
        ("मिलियन टन", 1),
    ],
    "monthly_production_mis": [
        ("mis statement", 6), ("monthly production", 6), ("production / mis", 6),
        ("overburden", 2), ("ob removal", 2), ("target", 1), ("achievement", 2),
        ("stripping ratio", 3), ("lakh te", 2),
        ("मासिक उत्पादन", 6), ("उत्पादन विवरण", 6), ("लक्ष्य", 1), ("वास्तविक", 1),
        ("कोयला उत्पादन", 4), ("अधिभार", 2),
    ],
    "parliamentary_qa_response": [
        ("lok sabha", 6), ("rajya sabha", 6), ("starred question", 7),
        ("unstarred question", 7), ("to be answered on", 5), ("draft reply", 5),
        ("ministry of coal", 2), ("parliament", 3),
        ("लोक सभा", 6), ("राज्य सभा", 6), ("तारांकित प्रश्न", 7),
        ("अतारांकित प्रश्न", 7), ("कोयला मंत्रालय", 2), ("संसद", 3),
    ],
    "inspection_report": [
        ("inspection note", 6), ("safety inspection", 6), ("observations", 2),
        ("risk rating", 4), ("compliance", 2), ("inspection report", 6),
        ("निरीक्षण", 6), ("सुरक्षा निरीक्षण", 6), ("अवलोकन", 2), ("अनुपालन", 2),
    ],
    "borehole_log_summary": [
        ("borehole", 5), ("borehole log", 7), ("collar rl", 4), ("core recovery", 4),
        ("total depth", 2), ("seam", 1), ("exploration wing", 3),
        ("वेधछिद्र", 5), ("बोरहोल", 5), ("अन्वेषण", 3), ("कोर प्राप्ति", 4),
    ],
    "correspondence": [
        ("sub:", 3), ("subject:", 3), ("with reference to", 3), ("no.", 1),
        ("dt.", 2), ("chief geologist", 2), ("regional geologist", 2), ("letter", 2),
        ("विषय:", 3), ("संदर्भ", 2), ("पत्र", 2), ("मुख्य भूविज्ञानी", 2),
    ],
}

_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_DATE_HINTS = re.compile(
    r"(?:as on|dated?|dt\.?|answered on|date completed)\s*[:\-]?\s*"
    r"([0-3]?\d[./-][0-1]?\d[./-](?:19|20)\d\d|(?:19|20)\d\d[./-][0-1]?\d[./-][0-3]?\d|"
    r"[0-3]?\d\s+[A-Za-z]{3,9}\.?\s*,?\s*(?:19|20)\d\d)",
    re.IGNORECASE,
)


def detect_language(text: str) -> str:
    dev = len(_DEVANAGARI.findall(text))
    if dev == 0:
        return "en"
    ratio = dev / max(1, len(re.findall(r"\w", text)))
    return "hi" if ratio > 0.25 else "mixed"


def detect_date(text: str) -> datetime | None:
    m = _DATE_HINTS.search(text)
    if not m:
        return None
    try:
        return dateparser.parse(m.group(1), dayfirst=True, fuzzy=True)
    except (ValueError, OverflowError):
        return None


def classify(text: str, *, filename: str = "") -> tuple[str, str, datetime | None]:
    haystack = f"{filename}\n{text}".lower()
    scores = {
        dtype: sum(w for kw, w in rules if kw in haystack)
        for dtype, rules in _RULES.items()
    }
    best = max(scores, key=scores.get)
    doc_type = best if scores[best] >= 3 else "unknown"
    return doc_type, detect_language(text), detect_date(text)
