"""Map an extracted string back to a bounding box + human-readable snippet on a Page."""

from __future__ import annotations

import re

from app.services.ingestion.page_extract import Page, Word


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9.]+", "", s.lower())


def bbox_for(page: Page, value: str) -> dict | None:
    """Union the boxes of the page words that make up `value` (best effort)."""
    targets = [_norm(t) for t in value.split() if _norm(t)]
    if not targets or not page.words:
        return None

    hits: list[Word] = []
    norm_words = [(_norm(w.text), w) for w in page.words]
    for tgt in targets:
        for nw, w in norm_words:
            if nw and (nw == tgt or tgt in nw or nw in tgt):
                hits.append(w)
                break
    if not hits:
        return None
    return {
        "x0": min(w.x0 for w in hits),
        "y0": min(w.y0 for w in hits),
        "x1": max(w.x1 for w in hits),
        "y1": max(w.y1 for w in hits),
        "unit": page.unit,
        "page_width": page.width,
        "page_height": page.height,
        "dpi": page.dpi,
    }


def snippet_for(page: Page, match_text: str, *, width: int = 140) -> str:
    """The source line(s) containing `match_text`, trimmed."""
    idx = page.text.lower().find(match_text.lower())
    if idx == -1:
        # fall back to the first line mentioning any token of the match
        for ln in page.lines():
            if any(tok.lower() in ln.lower() for tok in match_text.split()[:2]):
                return ln.strip()[:width]
        return match_text[:width]
    start = page.text.rfind("\n", 0, idx) + 1
    end = page.text.find("\n", idx)
    if end == -1:
        end = len(page.text)
    return page.text[start:end].strip()[:width]
