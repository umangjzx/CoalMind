"""Domain term normalisation for topic modelling and the word cloud.

Merges Hindi / English / transliterated variants of the same concept (PRD FR-6:
"khadan", "mine", "colliery" -> one term) and strips domain boilerplate so the
cloud isn't dominated by "coal", "limited", "report".
"""

from __future__ import annotations

import re

# variant -> canonical
SYNONYMS: dict[str, str] = {
    # mine
    "khadan": "mine", "khadaan": "mine", "colliery": "mine", "collieries": "mine",
    "opencast": "mine", "khan": "mine",
    # reserve
    "bhandar": "reserve", "reserves": "reserve",
    # production
    "utpadan": "production", "output": "production",
    # seam
    "parat": "seam",
    # subsidiary / company
    "subsidiaries": "subsidiary",
    # safety
    "suraksha": "safety",
    # conveyor
    "conveyer": "conveyor",
}

_ROMAN_HINDI = {
    "aur": "and", "hai": "is", "ka": "of", "ki": "of", "ke": "of", "mein": "in",
    "se": "from", "ko": "to", "par": "on",
}

DOMAIN_STOPWORDS = {
    "coal", "india", "limited", "ltd", "report", "reporting", "statement", "note",
    "page", "date", "dated", "no", "sub", "subject", "ref", "reference", "shall",
    "system", "data", "government", "ministry", "lok", "sabha", "rajya", "question",
    "answered", "reply", "draft", "figures", "figure", "total", "category", "as",
    "on", "the", "and", "for", "with", "from", "this", "that", "was", "were", "are",
    "per", "cent", "percent", "mt", "te", "lakh", "million", "tonnes", "cum",
    "bccl", "ccl", "ecl", "mcl", "ncl", "secl", "wcl", "nec", "cmpdi", "cil",
    "eastern", "central", "northern", "western", "southern", "coalfields", "mahanadi",
    "bharat", "coking", "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
}

_TOKEN = re.compile(r"[A-Za-zऀ-ॿ]{3,}")


def canon(token: str) -> str:
    t = token.lower()
    t = _ROMAN_HINDI.get(t, t)
    return SYNONYMS.get(t, t)


def tokenize(text: str) -> list[str]:
    out: list[str] = []
    for m in _TOKEN.finditer(text):
        c = canon(m.group(0))
        if c and c not in DOMAIN_STOPWORDS and len(c) >= 3:
            out.append(c)
    return out


def normalized_text(text: str) -> str:
    """Text with variants folded — used to feed the vectoriser."""
    return " ".join(tokenize(text))
