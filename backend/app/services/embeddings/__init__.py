"""Embedding provider abstraction. `get_embedder()` picks one from settings."""

from app.services.embeddings.base import Embedder, EmbeddingUnavailable
from app.services.embeddings.factory import get_embedder

__all__ = ["Embedder", "EmbeddingUnavailable", "get_embedder"]
