from __future__ import annotations

import pytest

from app.core.config import get_settings
from app.services.embeddings.factory import get_embedder
from app.services.llm.base import LLMUnavailable
from app.services.llm.factory import get_llm


def _reset_caches():
    get_llm.cache_clear()
    get_embedder.cache_clear()
    get_settings.cache_clear()


def test_ollama_selected_by_default(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("LLM_MODEL", "mistral")
    _reset_caches()
    provider = get_llm()
    assert provider.name == "ollama"
    assert provider.model == "mistral"
    _reset_caches()


def test_anthropic_blocked_when_sovereign(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ALLOW_THIRD_PARTY_API", "false")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    _reset_caches()
    with pytest.raises(LLMUnavailable, match="ALLOW_THIRD_PARTY_API"):
        get_llm()
    _reset_caches()


def test_embedder_defaults_to_fastembed(monkeypatch):
    monkeypatch.setenv("EMBED_PROVIDER", "fastembed")
    _reset_caches()
    emb = get_embedder()
    assert emb.name == "fastembed"
    assert emb.dim == 384
    _reset_caches()
