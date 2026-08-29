"""Hosted LLM via the Anthropic API.

Only instantiated when ALLOW_THIRD_PARTY_API is true — see factory.get_llm().
Intended for non-sensitive dev/demo corpora, never as the default for real CIL data.
"""

from __future__ import annotations

from app.core.logging import get_logger
from app.services.llm.base import ChatMessage, LLMUnavailable

log = get_logger(__name__)


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise LLMUnavailable("ANTHROPIC_API_KEY is not set")
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover
            raise LLMUnavailable("anthropic package not installed") from exc
        self._client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def health(self) -> bool:
        # Avoid burning tokens on a probe; construction already validated the key.
        return True

    def complete(self, prompt: str, *, temperature: float = 0.0, max_tokens: int = 1024) -> str:
        return self.chat([ChatMessage(role="user", content=prompt)],
                         temperature=temperature, max_tokens=max_tokens)

    def chat(
        self, messages: list[ChatMessage], *, temperature: float = 0.0, max_tokens: int = 1024
    ) -> str:
        system = "\n\n".join(m.content for m in messages if m.role == "system") or None
        turns = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.role in ("user", "assistant")
        ]
        try:
            resp = self._client.messages.create(
                model=self.model,
                system=system,
                messages=turns,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return "".join(block.text for block in resp.content if block.type == "text").strip()
        except Exception as exc:  # anthropic raises several subclasses
            raise LLMUnavailable(f"anthropic call failed: {exc}") from exc
