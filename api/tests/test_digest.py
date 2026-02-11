import uuid

from httpx import ASGITransport, AsyncClient

from app.database import settings
from app.main import app

TEST_API_KEY = "test-key-for-testing"

SAMPLE_DIGEST = {
    "digest_date": "2026-01-15",
    "title": "2026年1月15日のテックニュースまとめ",
    "content": "本日のハイライト...",
    "article_count": 10,
    "article_ids": [str(uuid.uuid4()), str(uuid.uuid4())],
}


async def test_create_digest(client):
    response = await client.post("/digest", json=SAMPLE_DIGEST)
    assert response.status_code == 201
    data = response.json()
    assert data["digest_date"] == SAMPLE_DIGEST["digest_date"]
    assert data["title"] == SAMPLE_DIGEST["title"]
    assert "id" in data
    uuid.UUID(data["id"])


async def test_create_digest_duplicate_date(client):
    await client.post("/digest", json=SAMPLE_DIGEST)
    response = await client.post("/digest", json=SAMPLE_DIGEST)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


async def test_list_digests(client):
    for i in range(3):
        digest = SAMPLE_DIGEST.copy()
        digest["digest_date"] = f"2026-01-{15 + i:02d}"
        await client.post("/digest", json=digest)

    response = await client.get("/digest")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert data["page"] == 1
    assert data["per_page"] == 20
    assert len(data["items"]) == 3
    # Should be sorted by date descending
    assert data["items"][0]["digest_date"] == "2026-01-17"


async def test_get_digest_by_date(client):
    await client.post("/digest", json=SAMPLE_DIGEST)

    response = await client.get("/digest/2026-01-15")
    assert response.status_code == 200
    data = response.json()
    assert data["digest_date"] == "2026-01-15"
    assert data["content"] == SAMPLE_DIGEST["content"]


async def test_get_digest_not_found(client):
    response = await client.get("/digest/2099-12-31")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


async def test_create_digest_without_api_key():
    """POST /digest without API key should return 401."""
    original = settings.api_keys
    settings.api_keys = [TEST_API_KEY]
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as ac:
            response = await ac.post("/digest", json=SAMPLE_DIGEST)
        assert response.status_code == 401
    finally:
        settings.api_keys = original


async def test_create_digest_with_invalid_api_key():
    """POST /digest with invalid API key should return 401."""
    original = settings.api_keys
    settings.api_keys = [TEST_API_KEY]
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-API-Key": "invalid-key"},
        ) as ac:
            response = await ac.post("/digest", json=SAMPLE_DIGEST)
        assert response.status_code == 401
    finally:
        settings.api_keys = original
