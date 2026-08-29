"""Confidence scoring for extracted fields.

Design goals: (1) OCR-sourced values are systematically less trusted; (2) values
that match a clean labelled pattern score high; (3) nothing exceeds ~0.97 so the
human-review safety net always has headroom. Values below the configured
CONFIDENCE_THRESHOLD are routed to the review queue.
"""

from __future__ import annotations

import re
import statistics

from app.services.ingestion.page_extract import Page

_MAX = 0.97


def _ocr_word_conf(page: Page, value: str) -> float | None:
    if page.source_kind != "ocr" or not page.words:
        return None
    toks = {t.lower() for t in re.findall(r"\w+", value)}
    confs = [w.ocr_conf for w in page.words if w.text.lower() in toks]
    return statistics.fmean(confs) if confs else None


def score(base: float, *, page: Page, matched: str, value: str) -> float:
    conf = base

    # OCR penalty, informed by Tesseract's own per-word confidence when available.
    if page.source_kind == "ocr":
        wc = _ocr_word_conf(page, value)
        conf *= 0.75 if wc is None else (0.6 + 0.35 * wc)

    # a match that had to span a lot of filler text is shakier
    if len(matched) > 90:
        conf *= 0.9

    # a bare number with no surrounding label context is weaker
    if re.fullmatch(r"[\d.,]+", value) and len(matched) < 12:
        conf *= 0.85

    return round(min(conf, _MAX), 3)
