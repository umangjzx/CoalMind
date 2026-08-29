"""Extractive-first narrative synthesis.

The LLM is given ONLY the gathered facts (each already carrying a citation marker)
and told to weave them into prose without inventing figures. If the LLM is
unavailable, a deterministic sentence assembled from the same facts is used
instead (PRD "graceful degradation").
"""

from __future__ import annotations

import os

from app.core.logging import get_logger
from app.services.llm import get_llm
from app.services.llm.base import ChatMessage, LLMUnavailable

log = get_logger(__name__)

_SYSTEM = (
    "You draft passages for Coal India Limited reports answering government and "
    "parliamentary queries. Rules: use ONLY the facts provided; never introduce a "
    "number, name or date that is not in the facts; keep every figure's [[c:N]] "
    "citation marker exactly as given, immediately after the figure; be concise and "
    "formal; 2-4 sentences unless told otherwise."
)


def synthesize(instruction: str, facts_lines: list[str], *, max_sentences: int = 4) -> str:
    facts_block = "\n".join(f"- {ln}" for ln in facts_lines if ln)
    if not facts_block:
        return ""
    if os.environ.get("COALMIND_NARRATIVE_LLM", "1") == "0":
        return _fallback(facts_lines)
    try:
        llm = get_llm()
        prompt = (
            f"{instruction}\n\nFacts (keep the [[c:N]] markers):\n{facts_block}\n\n"
            f"Write at most {max_sentences} sentences."
        )
        text = llm.chat(
            [ChatMessage(role="system", content=_SYSTEM), ChatMessage(role="user", content=prompt)],
            temperature=0.1,
            max_tokens=400,
        ).strip()
        if text and "[[c:" in text:
            return text
        log.info("LLM draft dropped citations; using deterministic fallback")
    except LLMUnavailable as exc:
        log.info("LLM unavailable, deterministic narrative: %s", exc)
    except Exception as exc:  # noqa: BLE001
        log.warning("LLM narrative failed: %s", exc)

    return _fallback(facts_lines)


def _fallback(facts_lines: list[str]) -> str:
    """Deterministic narrative: join the fact lines (markers preserved) into prose."""
    joined = "; ".join(ln.rstrip(".") for ln in facts_lines if ln)
    return f"{joined}." if joined else ""
