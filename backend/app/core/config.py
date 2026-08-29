"""Typed application settings, loaded from the environment / project-root .env.

Every knob the platform needs at runtime lives here so the rest of the code never
reads os.environ directly. See .env.example for documentation of each value.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

# repo root = .../SIH26023 ; this file is backend/app/core/config.py
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", REPO_ROOT / ".env.example"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Postgres ---
    postgres_user: str = "coalmind"
    postgres_password: str = "coalmind"
    postgres_db: str = "coalmind"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    database_url: str | None = None  # explicit override wins

    # --- MinIO ---
    minio_endpoint: str = "localhost:9000"
    minio_root_user: str = "coalmind"
    minio_root_password: str = "coalmind-secret"
    minio_bucket: str = "coalmind-documents"
    minio_secure: bool = False

    # --- LLM ---
    llm_provider: Literal["ollama", "anthropic"] = "ollama"
    llm_model: str = "mistral"
    ollama_base_url: str = "http://localhost:11434"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"

    # --- Embeddings ---
    # (Anthropic has no first-party embeddings endpoint; use fastembed on-prem.)
    embed_provider: Literal["fastembed", "ollama"] = "fastembed"
    embed_model: str = "BAAI/bge-small-en-v1.5"
    embed_dim: int = 384

    # --- Data sovereignty ---
    allow_third_party_api: bool = True

    # --- Extraction ---
    confidence_threshold: float = Field(default=0.75, ge=0.0, le=1.0)

    # --- Auth ---
    jwt_secret: str = "dev-only-change-me"
    jwt_access_ttl_min: int = 30
    jwt_refresh_ttl_days: int = 7

    # --- API ---
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
