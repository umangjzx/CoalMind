"""On-prem embeddings via fastembed (ONNX, CPU-friendly, no external service).

Default model BAAI/bge-small-en-v1.5 -> 384 dims. The model is downloaded once
to a local cache on first use.
"""

from __future__ import annotations

from functools import cached_property

from app.core.logging import get_logger
from app.services.embeddings.base import EmbeddingUnavailable

log = get_logger(__name__)


class FastEmbedEmbedder:
    name = "fastembed"

    def __init__(self, model: str, dim: int) -> None:
        self.model = model
        self.dim = dim

    @cached_property
    def _model(self):
        try:
            from fastembed import TextEmbedding
        except ImportError as exc:  # pragma: no cover
            raise EmbeddingUnavailable("fastembed not installed") from exc
        log.info("loading fastembed model %s (first run downloads weights)", self.model)
        return TextEmbedding(model_name=self.model)

    def health(self) -> bool:
        # Cheap: just confirm the library is importable. The model is loaded
        # lazily on first embed() (downloads weights once) — we don't want a
        # /health probe to block on a cold download.
        try:
            import fastembed  # noqa: F401

            return True
        except ImportError as exc:  # pragma: no cover
            log.warning("fastembed not importable: %s", exc)
            return False

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return [vec.tolist() for vec in self._model.embed(texts)]

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]
