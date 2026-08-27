"""Contract tests for /api/colorrec."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


def test_colorrec_health_returns_status():
    client = TestClient(app)
    res = client.get("/api/colorrec/health")
    assert res.status_code == 200
    body = res.json()
    assert "enabled" in body
    assert "ready" in body
    assert "model_path" in body


def test_colorrec_retrieve_503_when_not_ready():
    client = TestClient(app)
    with patch(
        "app.api.colorrec.colorrec_status",
        return_value={
            "enabled": True,
            "ready": False,
            "missing": ["embeddings"],
            "model_path": "/tmp/model",
            "embeddings_path": "/tmp/missing.npy",
        },
    ):
        res = client.post(
            "/api/colorrec/retrieve",
            json={"query": "warm jazz poster"},
        )
    assert res.status_code == 503


def test_colorrec_retrieve_returns_results_when_ready():
    client = TestClient(app)
    fake_hits = [
        {
            "rank": 1,
            "score": 0.33,
            "hex": "#704214",
            "name": "sepia brown",
            "explanation": "matched: jazz",
        }
    ]
    with patch(
        "app.api.colorrec.colorrec_status",
        return_value={
            "enabled": True,
            "ready": True,
            "model_path": "/tmp/model",
            "top_k_default": 8,
        },
    ), patch(
        "app.api.colorrec.retrieve_colors",
        return_value=fake_hits,
    ):
        res = client.post(
            "/api/colorrec/retrieve",
            json={"query": "warm nostalgic jazz poster", "top_k": 5},
        )
    assert res.status_code == 200
    body = res.json()
    assert body["query"] == "warm nostalgic jazz poster"
    assert body["results"] == fake_hits
