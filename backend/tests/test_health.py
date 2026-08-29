from __future__ import annotations


def test_health_shape(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in {"ok", "degraded"}
    # every dependency is probed and reported, even when down
    for key in ("db", "storage", "llm", "embeddings"):
        assert key in body["checks"]
        assert body["checks"][key] in {"ok", "down", "blocked", "skipped"}


def test_version_endpoint(client):
    r = client.get("/version")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "coalmind-backend"
    assert body["llm_provider"] in {"ollama", "anthropic"}


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "coalmind-backend"
