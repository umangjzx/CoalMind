"""On-prem embeddings via fastembed (ONNX, CPU-friendly, no external service).

Default model BAAI/bge-small-en-v1.5 -> 384 dims. The model is downloaded once
to a local cache on first use.

Concurrency: ONNX Runtime spins its own intra-op thread pool, so N request
threads each calling ``embed()`` on an unbounded pool oversubscribes the CPU and
latency collapses. We (a) cap the ONNX threads, (b) serialise the actual inference
with a lock, and (c) memoise single-text embeddings (the RAG hot path re-embeds
the same question on every cache lookup).
"""

from __future__ import annotations

import os
import threading
from collections import OrderedDict
from functools import cached_property

from app.core.logging import get_logger
from app.services.embeddings.base import EmbeddingUnavailable

log = get_logger(__name__)

_CACHE_MAX = 2048


class FastEmbedEmbedder:
    name = "fastembed"

    def __init__(self, model: str, dim: int) -> None:
        self.model = model
        self.dim = dim
        self._infer_lock = threading.Lock()   # serialises the ONNX call
        self._cache_lock = threading.Lock()   # guards the little LRU below
        self._cache: OrderedDict[str, list[float]] = OrderedDict()

    @cached_property
    def _threads(self) -> int:
        env = os.environ.get("FASTEMBED_THREADS")
        if env and env.isdigit():
            return max(1, int(env))
        # leave headroom for concurrent request threads on a shared box
        return max(1, (os.cpu_count() or 4) // 2)

    @cached_property
    def _model(self):
        try:
            from fastembed import TextEmbedding
        except ImportError as exc:  # pragma: no cover
            raise EmbeddingUnavailable("fastembed not installed") from exc
        log.info("loading fastembed model %s (threads=%d)", self.model, self._threads)
        try:
            return TextEmbedding(model_name=self.model, threads=self._threads)
        except TypeError:  # older fastembed without the threads kwarg
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

    def _infer(self, texts: list[str]) -> list[list[float]]:
        with self._infer_lock:
            return [vec.tolist() for vec in self._model.embed(texts)]

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        # serve what we can from cache, infer the rest in one batch
        out: list[list[float] | None] = [self._get(t) for t in texts]
        missing = [(i, t) for i, (t, v) in enumerate(zip(texts, out, strict=True)) if v is None]
        if missing:
            vecs = self._infer([t for _, t in missing])
            for (i, t), v in zip(missing, vecs, strict=True):
                out[i] = v
                self._put(t, v)
        return [v for v in out if v is not None]

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]

    # --- tiny thread-safe LRU ------------------------------------------------
    def _get(self, text: str) -> list[float] | None:
        with self._cache_lock:
            v = self._cache.get(text)
            if v is not None:
                self._cache.move_to_end(text)
            return v

    def _put(self, text: str, vec: list[float]) -> None:
        with self._cache_lock:
            self._cache[text] = vec
            self._cache.move_to_end(text)
            while len(self._cache) > _CACHE_MAX:
                self._cache.popitem(last=False)
