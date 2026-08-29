"""Supplemental entity recognition: spaCy NER + a mining-domain gazetteer.

Produces lower-confidence `mention_*` candidates (seams, borehole IDs, grades,
subsidiary codes, mine names) that generic rules don't target. These feed the
knowledge graph in M2; by confidence they all land in the review queue.
"""

from __future__ import annotations

import re
from functools import lru_cache

from app.core.logging import get_logger
from app.services.extraction.gazetteer import (
    BOREHOLE_RE,
    GRADE_RE,
    SEAM_RE,
    SUBSIDIARY_CODES,
    looks_like_mine,
)
from app.services.extraction.locate import bbox_for, snippet_for
from app.services.extraction.types import FieldCandidate
from app.services.ingestion.page_extract import Page

log = get_logger(__name__)

# spaCy tags document headers and table fragments as ORG/FAC on these forms. Rather
# than blacklist noise, keep only spans that carry an organisation-ish keyword — the
# precise domain mentions come from the gazetteer passes above.
_ORG_KEYWORDS = (
    "limited", "ltd", "coalfields", "colliery", "collieries", "ministry", "corporation",
    "cmpdi", "coal india", "department", "directorate", "authority",
)


def _plausible_org(text: str) -> bool:
    t = text.strip().lower()
    if len(t) < 6:
        return False
    return any(k in t for k in _ORG_KEYWORDS)


@lru_cache(maxsize=1)
def _nlp():
    try:
        import spacy

        return spacy.load("en_core_web_sm", disable=["lemmatizer"])
    except Exception as exc:  # noqa: BLE001
        log.warning("spaCy model unavailable, NER pass limited to gazetteer: %s", exc)
        return None


def _cand(key, label, value, entity_type, page: Page, conf: float) -> FieldCandidate:
    return FieldCandidate(
        field_key=key,
        label=label,
        value_text=value,
        entity_type=entity_type,
        extractor="gazetteer" if key != "mention_org" else "spacy_ner",
        source_kind=page.source_kind,
        page_no=page.page_no,
        bbox=bbox_for(page, value),
        source_snippet=snippet_for(page, value),
        confidence=round(conf * (0.8 if page.source_kind == "ocr" else 1.0), 3),
    )


def extract_mentions(pages: list[Page]) -> list[FieldCandidate]:
    out: list[FieldCandidate] = []
    seen: set[tuple] = set()

    def add(c: FieldCandidate) -> None:
        k = (c.field_key, c.value_text.lower(), c.page_no)
        if k not in seen:
            seen.add(k)
            out.append(c)

    nlp = _nlp()
    for page in pages:
        for m in SEAM_RE.finditer(page.text):
            add(_cand("mention_seam", "Seam (mention)", m.group(0), "Seam", page, 0.62))
        for m in BOREHOLE_RE.finditer(page.text):
            add(_cand("mention_borehole_id", "Borehole ID (mention)", m.group(0),
                      "Block", page, 0.68))
        for m in GRADE_RE.finditer(page.text):
            add(_cand("mention_grade", "Coal grade (mention)", m.group(0), "Mineral", page, 0.6))
        for code in SUBSIDIARY_CODES:
            if _word_present(page.text, code):
                add(_cand("mention_subsidiary", "Subsidiary (mention)", code,
                          "Subsidiary", page, 0.7))
        for ln in page.lines():
            if looks_like_mine(ln) and ":" in ln:
                # stop at the next inline label so "Mine : X   Date : Y" -> "X"
                val = re.split(r"\s+[A-Z][A-Za-z]{2,}\s*:", ln.split(":", 1)[1].strip())[0]
                val = val.strip()[:60]
                if val:
                    add(_cand("mention_mine", "Mine (mention)", val, "Mine", page, 0.55))
        if nlp is not None:
            doc = nlp(page.text[:20000])
            for ent in doc.ents:
                if ent.label_ in {"ORG", "FAC", "GPE"} and _plausible_org(ent.text):
                    add(_cand("mention_org", "Organisation / place (NER)", ent.text.strip(),
                              None, page, 0.5))
    return out


def _word_present(text: str, token: str) -> bool:
    return re.search(rf"\b{re.escape(token)}\b", text) is not None
