"""Embeddings via a local Ollama server (needs an embed model pulled, e.g.
``ollama pull nomic-embed-text``)."""

from __future__ import annotations

import httpx

from app.core.logging import get_logger
from app.services.embeddings.base import EmbeddingUnavailable

log = get_logger(__name__)


class OllamaEmbedder:
    name = "ollama"

    def __init__(self, base_url: str, model: str, dim: int, timeout: float = 60.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.dim = dim
        self._timeout = timeout

    def health(self) -> bool:
        try:
            r = httpx.get(f"{self.base_url}/api/tags", timeout=5.0)
            if r.status_code != 200:
                return False
            names = {m.get("name", "").split(":")[0] for m in r.json().get("models", [])}
            return self.model.split(":")[0] in names
        except httpx.HTTPError:  # pragma: no cover
            return False

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for text in texts:
            try:
                r = httpx.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": self.model, "prompt": text},
                    timeout=self._timeout,
                )
                r.raise_for_status()
                out.append(r.json()["embedding"])
            except (httpx.HTTPError, KeyError) as exc:
                raise EmbeddingUnavailable(f"ollama embeddings failed: {exc}") from exc
        return out

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]
