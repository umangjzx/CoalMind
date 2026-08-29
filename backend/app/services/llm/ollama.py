"""On-prem LLM via an Ollama server (the sovereign default).

`base_url` may be a local instance (`http://localhost:11434`) or a remote one
behind a tunnel (e.g. a GPU-hosted Ollama on Colab). `keep_alive` keeps the model
resident so back-to-back report generations don't pay the reload cost.
"""

from __future__ import annotations

import httpx

from app.core.logging import get_logger
from app.services.llm.base import ChatMessage, LLMUnavailable

log = get_logger(__name__)


class OllamaProvider:
    name = "ollama"

    def __init__(
        self, base_url: str, model: str, *, timeout: float = 120.0, keep_alive: str = "30m"
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._timeout = timeout
        self._keep_alive = keep_alive
        # a non-browser UA so ngrok's free-tier interstitial doesn't intercept API calls
        self._headers = {"ngrok-skip-browser-warning": "1", "User-Agent": "coalmind/httpx"}

    def health(self) -> bool:
        try:
            r = httpx.get(f"{self.base_url}/api/tags", timeout=8.0, headers=self._headers)
            return r.status_code == 200
        except httpx.HTTPError as exc:  # pragma: no cover - network dependent
            log.warning("ollama health probe failed: %s", exc)
            return False

    def complete(self, prompt: str, *, temperature: float = 0.0, max_tokens: int = 1024) -> str:
        try:
            r = httpx.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "keep_alive": self._keep_alive,
                    "options": {"temperature": temperature, "num_predict": max_tokens},
                },
                timeout=self._timeout,
                headers=self._headers,
            )
            r.raise_for_status()
            return r.json().get("response", "").strip()
        except httpx.HTTPError as exc:
            raise LLMUnavailable(f"ollama generate failed: {exc}") from exc

    def chat(
        self, messages: list[ChatMessage], *, temperature: float = 0.0, max_tokens: int = 1024
    ) -> str:
        try:
            r = httpx.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [{"role": m.role, "content": m.content} for m in messages],
                    "stream": False,
                    "keep_alive": self._keep_alive,
                    "options": {"temperature": temperature, "num_predict": max_tokens},
                },
                timeout=self._timeout,
                headers=self._headers,
            )
            r.raise_for_status()
            return r.json().get("message", {}).get("content", "").strip()
        except httpx.HTTPError as exc:
            raise LLMUnavailable(f"ollama chat failed: {exc}") from exc
