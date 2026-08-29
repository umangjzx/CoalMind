"""Mining-domain term lists and patterns used to recognise entities that generic
NER misses (seam names, borehole IDs, RoM grades, subsidiary codes, units)."""

from __future__ import annotations

import re

SUBSIDIARY_CODES = {"BCCL", "CCL", "ECL", "MCL", "NCL", "SECL", "WCL", "NEC", "CIL", "CMPDI"}

# Run-of-mine / coal grades used by CIL (G1..G17) plus legacy A..G bands.
GRADE_RE = re.compile(r"\bG-?(?:1[0-7]|[1-9])\b")

# Borehole identifiers: BH-<letters/digits> with dashes/slashes.
BOREHOLE_RE = re.compile(r"\bBH[-/][A-Z0-9]+(?:[-/][A-Z0-9]+)*\b", re.IGNORECASE)

# Seam names: "Seam-IV Bottom", "R-VII", "Seam III", roman or numeric suffixes.
SEAM_RE = re.compile(
    r"\b(?:Seam[-\s]?[IVXLC]+(?:\s+(?:Top|Bottom))?|[A-Z]-[IVXLC]{1,4}|Seam[-\s]?\d+)\b"
)

# Quantities with mining units.
QUANTITY_RE = re.compile(
    r"(?P<num>\d[\d,]*\.?\d*)\s*"
    r"(?P<unit>million\s+tonnes|lakh\s+te|lakh\s+tonnes|lakh\s+cum|lakh\s+cubic\s+metre|"
    r"mt|te|mtpa|cum/te|m\b|metre|percent|%)",
    re.IGNORECASE,
)

_MINE_WORDS = ("mine", "colliery", "opencast", "oc ", "project", "underground", "khadan")


def looks_like_mine(line: str) -> bool:
    low = line.lower()
    return any(w in low for w in _MINE_WORDS)


UNIT_CANON = {
    "million tonnes": "million_tonnes",
    "mt": "million_tonnes",
    "lakh te": "lakh_tonnes",
    "lakh tonnes": "lakh_tonnes",
    "te": "tonnes",
    "lakh cum": "lakh_cubic_metre",
    "lakh cubic metre": "lakh_cubic_metre",
    "percent": "percent",
    "%": "percent",
    "m": "metre",
    "metre": "metre",
    "mtpa": "million_tonnes_per_annum",
    "cum/te": "cubic_metre_per_tonne",
}


def canon_unit(raw: str) -> str:
    return UNIT_CANON.get(raw.strip().lower(), raw.strip().lower())
