"""Monthly Production / MIS Report for a mine."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.reports import facts
from app.services.reports.citations import CitationCollector
from app.services.reports.models import Block, DraftResult
from app.services.reports.narrative import synthesize
from app.services.reports.templates.base import fmt_qty, parse_date

_METRIC = {
    "coal_production_actual": "Coal production",
    "ob_removal_actual": "Overburden removal",
    "stripping_ratio": "Stripping ratio",
    "cil_production": "CIL coal production",
    "cil_target": "CIL production target",
}


class MonthlyProductionMIS:
    key = "monthly_production_mis"
    title = "Monthly Production / MIS Report"
    description = "Production, overburden and stripping-ratio figures for a mine for a month."

    def param_schema(self, db: Session) -> list[dict[str, Any]]:
        mines = facts.targets(db, "mine")
        return [
            {
                "name": "mine_id", "label": "Mine", "type": "select", "required": True,
                "options": [{"value": m["id"], "label": m["name"]} for m in mines],
            },
            {"name": "as_of", "label": "Month (any day in it)", "type": "date", "required": False},
        ]

    def build(self, db: Session, params: dict[str, Any], cc: CitationCollector) -> DraftResult:
        anchor = facts.resolve_anchor(db, params)
        if anchor is None:
            return DraftResult(
                self.title,
                [Block("paragraph", text="Select a mine to generate this report.")],
                [], [],
            )
        doc_ids = facts.anchor_documents(db, anchor)
        as_of = parse_date(params.get("as_of"))
        sub = facts.subsidiary_of(db, anchor)
        figures = facts.figures_on(db, doc_ids, facts.PRODUCTION_KEYS)

        title = f"{self.title} — {anchor.name}"
        blocks: list[Block] = [
            Block("heading", text=title, level=1, editable=False),
            Block(
                "kv",
                items=[
                    {"label": "Subsidiary", "value": sub.name if sub else "—"},
                    {"label": "Mine", "value": anchor.name},
                    {
                        "label": "Period",
                        "value": as_of.strftime("%B %Y") if as_of else "as reported",
                    },
                ],
                editable=False,
            ),
        ]

        rows: list[list[str]] = []
        fact_lines: list[str] = []
        for f in figures:
            metric = _METRIC.get(f.field_key, f.field_key.replace("_", " ").title())
            val = fmt_qty(f.value_json or {}) if f.value_json else f.value_text
            marker = cc.cite(db, f.id, val)
            rows.append([metric, f"{val} {marker}".strip()])
            fact_lines.append(f"{metric}: {val} {marker}".strip())

        if rows:
            blocks.append(
                Block("table", columns=["Parameter", "Figure"], rows=rows, editable=False)
            )
            para = synthesize(
                f"Summarise the monthly production performance of {anchor.name}"
                + (f" for {as_of.strftime('%B %Y')}" if as_of else "")
                + ".",
                fact_lines,
            )
            if para:
                blocks.append(Block("paragraph", text=para))
        else:
            blocks.append(
                Block("paragraph", text="No production figures recorded for this mine yet.")
            )

        return DraftResult(title, blocks, cc.citations(), cc.unresolved)
