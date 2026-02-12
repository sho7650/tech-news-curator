"""Integration tests for /sources endpoints."""

import uuid

from httpx import ASGITransport, AsyncClient

from app.database import settings
from app.main import app

TEST_API_KEY = "test-key-for-testing"

SAMPLE_SOURCE = {
    "name": "TechCrunch",
    "rss_url": "https://techcrunch.com/feed/",
    "site_url": "https://techcrunch.com",
    "category": "general",
}


async def test_create_source(client):
    response = await client.post("/sources", json=SAMPLE_SOURCE)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == SAMPLE_SOURCE["name"]
    assert data["rss_url"] == str(SAMPLE_SOURCE["rss_url"])
    assert data["is_active"] is True
    uuid.UUID(data["id"])


async def test_create_source_duplicate(client):
    await client.post("/sources", json=SAMPLE_SOURCE)
    response = await client.post("/sources", json=SAMPLE_SOURCE)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


async def test_create_source_no_auth():
    """POST /sources without API key should return 401."""
    original = settings.api_keys
    settings.api_keys = TEST_API_KEY
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as ac:
            response = await ac.post("/sources", json=SAMPLE_SOURCE)
        assert response.status_code == 401
    finally:
        settings.api_keys = original


async def test_list_sources(client):
    for i in range(3):
        source = SAMPLE_SOURCE.copy()
        source["rss_url"] = f"https://example.com/feed/{i}"
        source["name"] = f"Source {i}"
        await client.post("/sources", json=source)

    response = await client.get("/sources")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3


async def test_list_sources_active_only(client):
    source1 = SAMPLE_SOURCE.copy()
    source1["rss_url"] = "https://example.com/feed/active"
    resp1 = await client.post("/sources", json=source1)
    assert resp1.status_code == 201

    source2 = SAMPLE_SOURCE.copy()
    source2["rss_url"] = "https://example.com/feed/inactive"
    resp2 = await client.post("/sources", json=source2)
    source2_id = resp2.json()["id"]

    # Deactivate source2 via DELETE
    await client.delete(f"/sources/{source2_id}")

    response = await client.get("/sources", params={"active_only": "true"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1


async def test_list_sources_pagination(client):
    for i in range(5):
        source = SAMPLE_SOURCE.copy()
        source["rss_url"] = f"https://example.com/feed/page-{i}"
        source["name"] = f"Source {i}"
        await client.post("/sources", json=source)

    response = await client.get("/sources", params={"page": 1, "per_page": 2})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 5
    assert data["page"] == 1
    assert data["per_page"] == 2
    assert len(data["items"]) == 2


async def test_update_source(client):
    resp = await client.post("/sources", json=SAMPLE_SOURCE)
    source_id = resp.json()["id"]

    update_data = {"name": "Updated Name"}
    response = await client.put(f"/sources/{source_id}", json=update_data)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["rss_url"] == str(SAMPLE_SOURCE["rss_url"])  # unchanged


async def test_update_source_not_found(client):
    fake_id = str(uuid.uuid4())
    response = await client.put(f"/sources/{fake_id}", json={"name": "Test"})
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


async def test_update_source_duplicate_url(client):
    source1 = SAMPLE_SOURCE.copy()
    source1["rss_url"] = "https://example.com/feed/first"
    await client.post("/sources", json=source1)

    source2 = SAMPLE_SOURCE.copy()
    source2["rss_url"] = "https://example.com/feed/second"
    resp2 = await client.post("/sources", json=source2)
    source2_id = resp2.json()["id"]

    # Try to update source2's rss_url to match source1
    response = await client.put(
        f"/sources/{source2_id}",
        json={"rss_url": "https://example.com/feed/first"},
    )
    assert response.status_code == 409


async def test_delete_source(client):
    resp = await client.post("/sources", json=SAMPLE_SOURCE)
    source_id = resp.json()["id"]

    response = await client.delete(f"/sources/{source_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["is_active"] is False


async def test_delete_source_not_found(client):
    fake_id = str(uuid.uuid4())
    response = await client.delete(f"/sources/{fake_id}")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


async def test_delete_source_verify_deactivation(client):
    resp = await client.post("/sources", json=SAMPLE_SOURCE)
    source_id = resp.json()["id"]

    # Delete (deactivate)
    await client.delete(f"/sources/{source_id}")

    # Verify via list with active_only=false
    response = await client.get("/sources")
    data = response.json()
    source = next(s for s in data["items"] if s["id"] == source_id)
    assert source["is_active"] is False
