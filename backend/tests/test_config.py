from __future__ import annotations

from app.core.config import Settings


def test_sqlalchemy_url_built_from_parts():
    s = Settings(
        postgres_user="u", postgres_password="p", postgres_host="h",
        postgres_port=6543, postgres_db="d", database_url=None,
    )
    assert s.sqlalchemy_url == "postgresql+psycopg://u:p@h:6543/d"


def test_explicit_database_url_wins():
    s = Settings(database_url="postgresql+psycopg://x/y")
    assert s.sqlalchemy_url == "postgresql+psycopg://x/y"


def test_cors_origins_parsed_to_list():
    s = Settings(cors_origins="http://a, http://b ,http://c")
    assert s.cors_origin_list == ["http://a", "http://b", "http://c"]


def test_confidence_threshold_bounds():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        Settings(confidence_threshold=1.5)
