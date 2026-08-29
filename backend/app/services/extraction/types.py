"""Shared value objects for the extraction layer."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class FieldCandidate:
    """One extracted fact, with everything needed for traceability + review routing."""

    field_key: str
    label: str
    value_text: str
    value_json: dict[str, Any] | None = None
    entity_type: str | None = None

    extractor: str = ""          # rule id / "spacy_ner" / "gazetteer"
    source_kind: str = "pdf_text"  # pdf_text | ocr | ner
    page_no: int | None = None
    bbox: dict[str, Any] | None = None
    source_snippet: str = ""

    confidence: float = 0.0
    notes: list[str] = field(default_factory=list)  # validation / provenance messages
