"""Live embedding smoke test.

Skipped automatically when the model weights aren't available (offline CI). Run
it locally after `uv sync` to confirm the on-prem embedder works end to end.
"""

from __future__ import annotations

import pytest

from app.services.embeddings.fastembed_embedder import FastEmbedEmbedder


def test_fastembed_returns_384_dim_vector():
    emb = FastEmbedEmbedder(model="BAAI/bge-small-en-v1.5", dim=384)
    if not emb.health():
        pytest.skip("fastembed weights not available (offline)")
    vec = emb.embed_one("proved coal reserve of Jhanjra block")
    assert len(vec) == 384
    assert all(isinstance(x, float) for x in vec[:5])
