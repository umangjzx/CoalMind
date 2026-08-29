"""Geological Reserve Status Report."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.reports import facts
from app.services.reports.citations import CitationCollector
from app.services.reports.models import Block, DraftResult
from app.services.reports.narrative import synthesize
from app.services.reports.templates.base import fmt_qty, parse_date

_CATEGORY = {
    "proved_reserve": "Proved (measured)",
    "indicated_reserve": "Indicated",
    "inferred_reserve": "Inferred",
    "total_geological_reserve": "Total geological reserve",
}


class GeologicalReserveStatus:
    key = "geological_reserve_status"
    title = "Geological Reserve Status Report"
    description = (
        "Reserve position (proved / indicated / inferred) for a block or mine, as on a date."
    )

    def param_schema(self, db: Session) -> list[dict[str, Any]]:
        blocks = facts.targets(db, "block")
        mines = facts.targets(db, "mine")
        return [
            {
                "name": "block_id", "label": "Block", "type": "select", "required": False,
                "options": [{"value": b["id"], "label": b["name"]} for b in blocks],
                "help": "Pick a block, or a mine below.",
            },
            {
                "name": "mine_id", "label": "Mine (if no block)", "type": "select",
                "required": False,
                "options": [{"value": m["id"], "label": m["name"]} for m in mines],
            },
            {"name": "as_of", "label": "Reserves as on", "type": "date", "required": False},
        ]

    def build(self, db: Session, params: dict[str, Any], cc: CitationCollector) -> DraftResult:
        anchor = facts.resolve_anchor(db, params)
        if anchor is None:
            return DraftResult(
                self.title,
                [Block("paragraph", text="Select a block or mine to generate this report.")],
                [], [],
            )

        doc_ids = facts.anchor_documents(db, anchor)
        as_of = parse_date(params.get("as_of")) or facts.reserve_as_on(db, doc_ids)
        sub = facts.subsidiary_of(db, anchor)
        mine = facts.parent_mine(db, anchor) if anchor.kind == "block" else anchor
        seam, mineral = (
            facts.seam_and_grade(db, anchor) if anchor.kind == "block" else (None, None)
        )
        figures = facts.figures_on(db, doc_ids, facts.RESERVE_KEYS)

        title = f"{self.title} — {anchor.name}"
        blocks: list[Block] = [
            Block("heading", text=title, level=1, editable=False),
            Block(
                "kv",
                items=[
                    {"label": "Subsidiary", "value": sub.name if sub else "—"},
                    {"label": "Mine / Colliery", "value": mine.name if mine else "—"},
                    {"label": "Block", "value": anchor.name if anchor.kind == "block" else "—"},
                    {"label": "Principal seam", "value": seam.name if seam else "—"},
                    {
                        "label": "Average grade",
                        "value": (mineral.attrs.get("grade") if mineral else None) or "—",
                    },
                    {
                        "label": "Reserves as on",
                        "value": as_of.isoformat() if as_of else "as reported",
                    },
                ],
                editable=False,
            ),
        ]

        rows: list[list[str]] = []
        fact_lines: list[str] = []
        for f in figures:
            cat = _CATEGORY.get(f.field_key, f.field_key)
            qty = fmt_qty(f.value_json or {}) if f.value_json else f.value_text
            marker = cc.cite(db, f.id, qty)
            rows.append([cat, f"{qty} {marker}".strip()])
            fact_lines.append(f"{cat} is {qty} {marker}".strip())

        if rows:
            blocks.append(
                Block("table", columns=["Category", "Reserve"], rows=rows, editable=False)
            )
        else:
            blocks.append(
                Block("paragraph", text="No reserve figures are recorded for this entity yet.")
            )

        instruction = (
            f"Summarise the geological reserve status of {anchor.name}"
            + (f" as on {as_of.isoformat()}" if as_of else "")
            + (f" (subsidiary {sub.name})" if sub else "")
            + ". State the category-wise figures and note the total."
        )
        para = synthesize(instruction, fact_lines)
        if para:
            blocks.append(Block("paragraph", text=para))

        return DraftResult(title, blocks, cc.citations(), cc.unresolved)
