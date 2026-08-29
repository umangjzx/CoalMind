"""Ad-hoc Administrative Inquiry Response — free-text question answered from a
semantic search over the corpus, with cited source spans."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.knowledge import queries as kq
from app.services.reports.citations import CitationCollector
from app.services.reports.models import Block, Citation, DraftResult
from app.services.reports.narrative import synthesize


class AdhocInquiry:
    key = "adhoc_inquiry"
    title = "Ad-hoc Administrative Inquiry Response"
    description = "Answer a free-text administrative query from the most relevant source passages."

    def param_schema(self, db: Session) -> list[dict[str, Any]]:
        return [
            {"name": "question", "label": "Inquiry", "type": "text", "required": True},
            {
                "name": "k",
                "label": "Passages to consider",
                "type": "text",
                "required": False,
                "help": "default 5",
            },
        ]

    def build(self, db: Session, params: dict[str, Any], cc: CitationCollector) -> DraftResult:
        question = (params.get("question") or "").strip()
        try:
            k = max(1, min(10, int(params.get("k") or 5)))
        except (TypeError, ValueError):
            k = 5

        blocks: list[Block] = [
            Block(
                "heading", text="Ad-hoc Administrative Inquiry Response", level=1, editable=False
            ),
        ]
        if not question:
            blocks.append(Block("paragraph", text="Enter an inquiry to generate a response."))
            return DraftResult(self.title, blocks, [], [])

        blocks.append(Block("paragraph", text=f"**Inquiry.** {question}", editable=False))

        hits = kq.vector_search(db, question, k=k)
        if not hits:
            blocks.append(Block("paragraph", text="No relevant passages found in the corpus."))
            return DraftResult(self.title, blocks, [], [])

        # citations here point at documents/pages rather than a single field
        cites: list[Citation] = []
        fact_lines: list[str] = []
        for i, h in enumerate(hits, start=1):
            cites.append(
                Citation(
                    marker=i,
                    extraction_field_id=None,
                    document_id=h.document.id and str(h.document.id),
                    document_filename=h.document.original_filename,
                    page_no=h.chunk.page_no,
                    field_key="chunk",
                    value=f"score {h.score}",
                    snippet=h.chunk.text[:300],
                    confidence=h.score,
                )
            )
            fact_lines.append(f"{h.chunk.text.strip()[:260]} [[c:{i}]]")

        answer = synthesize(
            f"Answer this administrative inquiry using only the passages provided: {question}",
            fact_lines,
            max_sentences=6,
        )
        blocks.append(Block("paragraph", text=f"**Response.** {answer}"))
        blocks.append(
            Block(
                "paragraph",
                text="_Draft assembled from source passages; officer to verify and sign._",
                editable=False,
            )
        )
        return DraftResult(self.title, blocks, cites, [])
