"""Compose an extractive-first, cited answer from retrieved evidence.

Never fabricates: the LLM is constrained to the numbered sources and told to reply
INSUFFICIENT when they don't answer the question. If the LLM is unavailable the
engine degrades to "search-only" mode (return the ranked sources).
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.llm import get_llm
from app.services.llm.base import ChatMessage, LLMUnavailable
from app.services.rag.retrieve import Evidence, Retrieval

log = get_logger(__name__)

# bge-small compresses cosine into a narrow band: unrelated pairs ~0.35-0.48,
# on-topic ~0.55-0.80. Decline below the floor; a passage-only answer also needs
# at least one "solid" passage or a graph fact.
_EVIDENCE_FLOOR = 0.50
_SOLID_PASSAGE = 0.58
_SYSTEM = (
    "You answer questions for Coal India Limited officers using ONLY the numbered "
    "sources provided. Rules: never state a number, name or date that is not in the "
    "sources; put the matching [n] citation immediately after every figure or claim; "
    "if the sources do not answer the question, reply with exactly the single word "
    "INSUFFICIENT; be concise (2-5 sentences); reply in the same language as the "
    "question (Hindi question -> Hindi answer), keeping proper nouns and figures as "
    "written in the sources."
)


@dataclass(slots=True)
class Answer:
    answer_md: str
    citations: list[dict]
    evidence: list[dict]
    confidence: float
    status: str  # "answered" | "insufficient"
    mode: str    # "rag" | "search_only"
    flagged: bool = False  # answered but below the confidence threshold
    notes: list[str] = field(default_factory=list)


def _evidence_dicts(items: list[Evidence]) -> list[dict]:
    return [
        {
            "kind": e.kind, "text": e.text[:600], "score": e.score,
            "document_id": e.document_id, "document_filename": e.document_filename,
            "page_no": e.page_no, "source_field_id": e.source_field_id, "entity": e.entity,
        }
        for e in items
    ]


def _citations(items: list[Evidence]) -> list[dict]:
    return [
        {
            "marker": i + 1,
            "extraction_field_id": e.source_field_id,
            "document_id": e.document_id,
            "document_filename": e.document_filename,
            "page_no": e.page_no,
            "field_key": "graph_fact" if e.kind == "fact" else "chunk",
            "value": e.text[:200],
            "snippet": e.text[:300],
            "confidence": e.score,
        }
        for i, e in enumerate(items)
    ]


def _search_only(items: list[Evidence], citations: list[dict]) -> str:
    lines = ["_The language model is unavailable — showing the most relevant sources._", ""]
    for i, e in enumerate(items, start=1):
        lines.append(f"{i}. {e.text[:280]} [[c:{i}]]")
    return "\n".join(lines)


def _insufficient(items: list[Evidence]) -> str:
    if not items:
        return "No source in the corpus addresses this question. Nothing was retrieved."
    lines = [
        "There is not enough confident evidence in the corpus to answer this. "
        "The closest sources found (unverified):",
        "",
    ]
    for i, e in enumerate(items[:3], start=1):
        lines.append(f"{i}. {e.text[:240]} [[c:{i}]]")
    return "\n".join(lines)


def compose_answer(retr: Retrieval, *, max_sources: int = 6) -> Answer:
    settings = get_settings()
    items = retr.all[:max_sources]
    citations = _citations(items)
    evidence = _evidence_dicts(retr.all[:max_sources])

    has_fact = any(e.kind == "fact" for e in items)
    top_fact = max((e.score for e in items if e.kind == "fact"), default=0.0)
    top_pass = max((e.score for e in items if e.kind == "passage"), default=0.0)

    weak = retr.top_score < _EVIDENCE_FLOOR or (not has_fact and top_pass < _SOLID_PASSAGE)
    if not items or weak:
        return Answer(
            answer_md=_insufficient(items), citations=citations, evidence=evidence,
            confidence=round(retr.top_score, 3), status="insufficient", mode="rag",
        )
    confidence = round(min(0.97, max(top_fact, 0.9 * top_pass)), 3)

    if os.environ.get("COALMIND_NARRATIVE_LLM", "1") == "0":
        # deterministic mode used by tests / offline demos
        body = "; ".join(f"{e.text.rstrip('.')} [[c:{i}]]" for i, e in enumerate(items, 1))
        return Answer(
            answer_md=body + ".", citations=citations, evidence=evidence,
            confidence=confidence, status="answered", mode="search_only",
            flagged=confidence < settings.confidence_threshold,
            notes=["deterministic mode"],
        )

    sources_block = "\n".join(f"[{i}] {e.text[:500]}" for i, e in enumerate(items, start=1))
    prompt = (
        f"Question: {retr.question}\n\nNumbered sources:\n{sources_block}\n\n"
        "Answer the question now, citing [n] after each figure/claim."
    )
    try:
        text = get_llm().chat(
            [ChatMessage(role="system", content=_SYSTEM),
             ChatMessage(role="user", content=prompt)],
            temperature=0.1, max_tokens=350,
        ).strip()
    except LLMUnavailable as exc:
        log.info("LLM unavailable -> search-only answer: %s", exc)
        return Answer(
            answer_md=_search_only(items, citations), citations=citations, evidence=evidence,
            confidence=confidence, status="answered", mode="search_only",
            flagged=True, notes=["llm unavailable"],
        )

    if re.fullmatch(r"\s*INSUFFICIENT[.!]?\s*", text, re.IGNORECASE):
        return Answer(
            answer_md=_insufficient(items), citations=citations, evidence=evidence,
            confidence=round(retr.top_score * 0.8, 3), status="insufficient", mode="rag",
        )

    # normalise the model's [n] markers to our [[c:n]] form
    text = re.sub(r"\[(\d{1,2})\]", r"[[c:\1]]", text)
    if "[[c:" not in text:
        text += "".join(f" [[c:{i}]]" for i in range(1, min(3, len(items) + 1)))
        confidence = round(confidence * 0.85, 3)

    return Answer(
        answer_md=text, citations=citations, evidence=evidence, confidence=confidence,
        status="answered", mode="rag",
        flagged=confidence < settings.confidence_threshold or not has_fact and top_pass < 0.6,
    )
