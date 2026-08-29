"""Provider-neutral LLM interface used by the report, RAG and topic engines."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol, runtime_checkable

Role = Literal["system", "user", "assistant"]


@dataclass(slots=True)
class ChatMessage:
    role: Role
    content: str


class LLMUnavailable(RuntimeError):
    """Raised when the configured LLM cannot be reached or is disallowed.

    Callers are expected to degrade gracefully (e.g. fall back to search-only
    answers) rather than crash — see NFR "graceful degradation" in the PRD.
    """


@runtime_checkable
class LLMProvider(Protocol):
    name: str
    model: str

    def health(self) -> bool:
        """Cheap reachability probe. Never raises."""

    def complete(self, prompt: str, *, temperature: float = 0.0, max_tokens: int = 1024) -> str:
        """Single-turn completion."""

    def chat(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> str:
        """Multi-turn chat completion."""
