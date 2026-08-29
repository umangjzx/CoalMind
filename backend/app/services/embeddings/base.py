"""Provider-neutral embedding interface used by the vector store and RAG."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


class EmbeddingUnavailable(RuntimeError):
    """Raised when the configured embedder cannot be loaded or reached."""


@runtime_checkable
class Embedder(Protocol):
    name: str
    model: str
    dim: int

    def health(self) -> bool:
        """Cheap readiness probe. Never raises."""

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Return one dense vector per input text (order preserved)."""

    def embed_one(self, text: str) -> list[float]:
        ...
