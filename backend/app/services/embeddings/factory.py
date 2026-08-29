"""Chooses an embedding provider from settings."""

from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.services.embeddings.base import Embedder, EmbeddingUnavailable


@lru_cache
def get_embedder() -> Embedder:
    s = get_settings()

    if s.embed_provider == "fastembed":
        from app.services.embeddings.fastembed_embedder import FastEmbedEmbedder

        return FastEmbedEmbedder(model=s.embed_model, dim=s.embed_dim)

    if s.embed_provider == "ollama":
        from app.services.embeddings.ollama_embedder import OllamaEmbedder

        return OllamaEmbedder(
            base_url=s.ollama_base_url, model=s.embed_model, dim=s.embed_dim
        )

    raise EmbeddingUnavailable(f"unknown EMBED_PROVIDER: {s.embed_provider!r}")
