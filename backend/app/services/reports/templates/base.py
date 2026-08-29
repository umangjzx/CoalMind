"""Template contract + shared helpers for report builders."""

from __future__ import annotations

from datetime import date
from typing import Any, Protocol

from dateutil import parser as dateparser
from sqlalchemy.orm import Session

from app.services.reports.citations import CitationCollector
from app.services.reports.models import DraftResult


class Template(Protocol):
    key: str
    title: str
    description: str

    def param_schema(self, db: Session) -> list[dict[str, Any]]:
        """Fields the officer fills in — rendered as a form by the frontend.
        Each: {name, label, type: text|date|select, required, options?[{value,label}], help?}
        """

    def build(self, db: Session, params: dict[str, Any], cc: CitationCollector) -> DraftResult: ...


def parse_date(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    s = str(value).strip()
    try:  # ISO (yyyy-mm-dd) — the format the frontend date input emits
        return date.fromisoformat(s[:10])
    except ValueError:
        pass
    try:  # fall back to fuzzy parsing for officer free-text ("1 April 2021")
        return dateparser.parse(s, dayfirst=True).date()
    except (ValueError, OverflowError):
        return None


def fmt_qty(attrs: dict) -> str:
    v = attrs.get("quantity", attrs.get("value"))
    unit = str(attrs.get("unit", "")).replace("_", " ")
    if v is None:
        return "—"
    return f"{v:g} {unit}".strip()
