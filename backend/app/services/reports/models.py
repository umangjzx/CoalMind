"""Value objects shared across the report engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

BlockType = Literal["heading", "paragraph", "table", "kv"]


@dataclass(slots=True)
class Citation:
    marker: int  # 1-based; rendered as a superscript / footnote
    extraction_field_id: str | None
    document_id: str | None
    document_filename: str | None
    page_no: int | None
    field_key: str
    value: str
    snippet: str
    confidence: float


@dataclass(slots=True)
class Block:
    type: BlockType
    text: str = ""  # heading / paragraph (may contain [[c:N]] markers)
    level: int = 2  # heading level
    columns: list[str] = field(default_factory=list)  # table
    rows: list[list[str]] = field(default_factory=list)  # table cells (may contain [[c:N]])
    items: list[dict[str, Any]] = field(default_factory=list)  # kv: {label, value, citation?}
    editable: bool = True

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"type": self.type, "editable": self.editable}
        if self.type in ("heading", "paragraph"):
            d["text"] = self.text
            if self.type == "heading":
                d["level"] = self.level
        elif self.type == "table":
            d["columns"] = self.columns
            d["rows"] = self.rows
        elif self.type == "kv":
            d["items"] = self.items
        return d


@dataclass(slots=True)
class Unresolved:
    extraction_field_id: str
    field_key: str
    label: str
    document_id: str
    reason: str


@dataclass(slots=True)
class DraftResult:
    title: str
    blocks: list[Block]
    citations: list[Citation]
    unresolved: list[Unresolved]
