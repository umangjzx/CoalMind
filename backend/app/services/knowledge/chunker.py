"""Split extracted page text into overlapping chunks for embedding."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.ingestion.page_extract import Page

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+|\n{2,}")


@dataclass(slots=True)
class Chunk:
    index: int
    page_no: int | None
    text: str


def chunk_pages(
    pages: list[Page], *, target_chars: int = 600, overlap_chars: int = 90
) -> list[Chunk]:
    chunks: list[Chunk] = []
    idx = 0
    for page in pages:
        text = page.text.strip()
        if not text:
            continue
        units = [u.strip() for u in _SENT_SPLIT.split(text) if u.strip()]
        buf = ""
        for unit in units:
            if buf and len(buf) + 1 + len(unit) > target_chars:
                chunks.append(Chunk(idx, page.page_no, buf))
                idx += 1
                buf = (buf[-overlap_chars:] + " " + unit).strip() if overlap_chars else unit
            else:
                buf = f"{buf} {unit}".strip() if buf else unit
        if buf:
            chunks.append(Chunk(idx, page.page_no, buf))
            idx += 1
    return chunks
