"""Parliamentary Q&A response draft.

The officer supplies the question; the engine gathers the relevant figures from
the graph (production, reserves) and drafts a cited reply for approval.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EntityKind, KGEntity
from app.services.reports import facts
from app.services.reports.citations import CitationCollector
from app.services.reports.models import Block, DraftResult
from app.services.reports.narrative import synthesize
from app.services.reports.templates.base import fmt_qty


class ParliamentaryQA:
    key = "parliamentary_qa"
    title = "Parliamentary Q&A Response"
    description = "Draft a cited reply to a Lok Sabha / Rajya Sabha question from graph figures."

    def param_schema(self, db: Session) -> list[dict[str, Any]]:
        subs = facts.targets(db, "subsidiary")
        return [
            {
                "name": "reference",
                "label": "Question reference",
                "type": "text",
                "required": False,
                "help": "e.g. Lok Sabha Starred Question No. 312",
            },
            {"name": "question", "label": "Question text", "type": "text", "required": True},
            {
                "name": "answer_date",
                "label": "To be answered on",
                "type": "date",
                "required": False,
            },
            {
                "name": "subsidiary_id",
                "label": "Scope to subsidiary",
                "type": "select",
                "required": False,
                "options": [{"value": s["id"], "label": s["name"]} for s in subs],
            },
        ]

    def build(self, db: Session, params: dict[str, Any], cc: CitationCollector) -> DraftResult:
        ref = (params.get("reference") or "").strip()
        question = (params.get("question") or "").strip()
        title = f"Draft Reply — {ref}" if ref else "Draft Reply — Parliamentary Question"

        blocks: list[Block] = [
            Block(
                "heading", text="GOVERNMENT OF INDIA / MINISTRY OF COAL", level=1, editable=False
            ),
            Block("heading", text=title, level=2, editable=False),
        ]
        meta_items = []
        if ref:
            meta_items.append({"label": "Reference", "value": ref})
        if params.get("answer_date"):
            meta_items.append({"label": "To be answered on", "value": str(params["answer_date"])})
        if meta_items:
            blocks.append(Block("kv", items=meta_items, editable=False))
        if question:
            blocks.append(Block("paragraph", text=f"**Question.** {question}", editable=False))

        # gather figures: production figures + reserves across the (optionally scoped) graph
        stmt = select(KGEntity).where(
            KGEntity.kind.in_([EntityKind.production_figure, EntityKind.reserve])
        )
        if params.get("subsidiary_id"):
            stmt = stmt.where(KGEntity.subsidiary_id == params["subsidiary_id"])
        figures = db.execute(stmt.limit(40)).scalars().all()

        fact_lines: list[str] = []
        for e in figures:
            label = e.name
            qty = fmt_qty(e.attrs)
            marker = cc.cite(db, e.source_field_id, qty)
            period = e.attrs.get("period") or e.attrs.get("as_on")
            when = f" ({period})" if period else ""
            fact_lines.append(f"{label}{when}: {qty} {marker}".strip())

        if not fact_lines:
            blocks.append(
                Block(
                    "paragraph",
                    text="No figures in the knowledge graph match this scope yet. Ingest and "
                    "verify the relevant reports, then re-generate.",
                )
            )
            return DraftResult(
                title=title, blocks=blocks, citations=cc.citations(), unresolved=cc.unresolved
            )

        instruction = (
            "Draft the reply to the following parliamentary question using only the "
            f"figures listed. Question: {question or ref}. Structure as lettered points "
            "(a), (b) if appropriate."
        )
        answer = synthesize(instruction, fact_lines, max_sentences=6)
        blocks.append(Block("paragraph", text=f"**Answer.** {answer}"))
        blocks.append(
            Block(
                "paragraph",
                text="_Note: figures to be reconciled with Coal Controller data before "
                "finalisation; officer to review and sign._",
                editable=False,
            )
        )
        return DraftResult(
            title=title, blocks=blocks, citations=cc.citations(), unresolved=cc.unresolved
        )
