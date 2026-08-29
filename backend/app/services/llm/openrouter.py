"""Hosted LLM via OpenRouter (OpenAI-compatible chat completions).

Third-party API — only instantiated when ALLOW_THIRD_PARTY_API is true. Useful when
on-prem Ollama is too slow for a demo; weakens the data-sovereignty story, so keep
it off for real CIL corpora.
"""

from __future__ import annotations

import httpx

from app.core.logging import get_logger
from app.services.llm.base import ChatMessage, LLMUnavailable

log = get_logger(__name__)


class OpenRouterProvider:
    name = "openrouter"

    def __init__(self, api_key: str, model: str, base_url: str, timeout: float = 60.0) -> None:
        if not api_key:
            raise LLMUnavailable("OPENROUTER_API_KEY is not set")
        self.model = model
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # optional attribution for OpenRouter dashboards
            "HTTP-Referer": "https://github.com/umangjzx/CoalMind",
            "X-Title": "CoalMind AI",
        }
        self._timeout = timeout

    def health(self) -> bool:
        try:
            r = httpx.get(
                self._url.replace("/chat/completions", "/models"),
                headers=self._headers,
                timeout=8.0,
            )
            return r.status_code == 200
        except httpx.HTTPError as exc:  # pragma: no cover - network dependent
            log.warning("openrouter health probe failed: %s", exc)
            return False

    def complete(self, prompt: str, *, temperature: float = 0.0, max_tokens: int = 1024) -> str:
        return self.chat(
            [ChatMessage(role="user", content=prompt)],
            temperature=temperature, max_tokens=max_tokens,
        )

    def chat(
        self, messages: list[ChatMessage], *, temperature: float = 0.0, max_tokens: int = 1024
    ) -> str:
        try:
            r = httpx.post(
                self._url,
                headers=self._headers,
                timeout=self._timeout,
                json={
                    "model": self.model,
                    "messages": [{"role": m.role, "content": m.content} for m in messages],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            r.raise_for_status()
            data = r.json()
            return (data["choices"][0]["message"]["content"] or "").strip()
        except (httpx.HTTPError, KeyError, IndexError) as exc:
            raise LLMUnavailable(f"openrouter call failed: {exc}") from exc
