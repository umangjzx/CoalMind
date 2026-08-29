"""Chooses an LLM provider from settings, enforcing the data-sovereignty gate."""

from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.services.llm.base import LLMProvider, LLMUnavailable


@lru_cache
def get_llm() -> LLMProvider:
    s = get_settings()

    if s.llm_provider == "ollama":
        from app.services.llm.ollama import OllamaProvider

        return OllamaProvider(base_url=s.ollama_base_url, model=s.llm_model)

    if s.llm_provider == "anthropic":
        if not s.allow_third_party_api:
            raise LLMUnavailable(
                "LLM_PROVIDER=anthropic but ALLOW_THIRD_PARTY_API is false — "
                "refusing to send data to a hosted API."
            )
        from app.services.llm.anthropic_provider import AnthropicProvider

        return AnthropicProvider(api_key=s.anthropic_api_key, model=s.anthropic_model)

    raise LLMUnavailable(f"unknown LLM_PROVIDER: {s.llm_provider!r}")
