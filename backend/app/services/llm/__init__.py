"""LLM provider abstraction.

`get_llm()` returns a provider chosen by settings. Sovereign-by-default: an
Anthropic (hosted) provider is only handed out when ALLOW_THIRD_PARTY_API is true.
"""

from app.services.llm.base import ChatMessage, LLMProvider, LLMUnavailable
from app.services.llm.factory import get_llm

__all__ = ["ChatMessage", "LLMProvider", "LLMUnavailable", "get_llm"]
