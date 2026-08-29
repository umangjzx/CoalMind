"""Extraction layer: classified pages -> validated `FieldCandidate`s.

    cands, doc_notes = extract_fields(doc_type, pages)
"""

from __future__ import annotations

from app.services.extraction.ner import extract_mentions
from app.services.extraction.rules import extract_by_rules
from app.services.extraction.types import FieldCandidate
from app.services.extraction.validate import validate
from app.services.ingestion.page_extract import Page

__all__ = ["FieldCandidate", "extract_fields"]


def extract_fields(doc_type: str, pages: list[Page]) -> tuple[list[FieldCandidate], list[str]]:
    rule_cands = extract_by_rules(doc_type, pages)
    rule_keys = {c.field_key for c in rule_cands}

    # mentions never override a targeted rule field for the same key
    mentions = [c for c in extract_mentions(pages) if c.field_key not in rule_keys]

    cands = rule_cands + mentions
    doc_notes = validate(cands)
    return cands, doc_notes
