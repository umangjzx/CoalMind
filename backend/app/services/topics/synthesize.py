"""One-paragraph "what's driving this topic" synthesis (LLM, extractive-first)."""

from __future__ import annotations

import os

from app.core.logging import get_logger
from app.services.llm import get_llm
from app.services.llm.base import ChatMessage, LLMUnavailable

log = get_logger(__name__)

_SYSTEM = (
    "You summarise emerging themes in Coal India Limited correspondence and reports. "
    "Given a topic's key terms and a few source snippets, write ONE short paragraph "
    "(2-3 sentences) describing what is driving this theme. Use only the material "
    "provided; do not invent specifics."
)


def topic_summary(label: str, terms: list[str], snippets: list[str]) -> str:
    deterministic = (
        f"Recurring theme around: {', '.join(terms[:6])}. "
        f"Seen across {len(snippets)} document(s)."
    )
    if os.environ.get("COALMIND_NARRATIVE_LLM", "1") == "0" or not snippets:
        return deterministic
    snip = "\n".join(f"- {s[:240]}" for s in snippets[:5])
    prompt = (
        f"Topic terms: {', '.join(terms[:10])}\n\nSource snippets:\n{snip}\n\n"
        "Write the paragraph now."
    )
    try:
        text = get_llm().chat(
            [ChatMessage(role="system", content=_SYSTEM),
             ChatMessage(role="user", content=prompt)],
            temperature=0.2, max_tokens=180,
        ).strip()
        return text or deterministic
    except LLMUnavailable as exc:
        log.info("topic summary LLM unavailable: %s", exc)
        return deterministic
    except Exception as exc:  # noqa: BLE001
        log.warning("topic summary failed: %s", exc)
        return deterministic
