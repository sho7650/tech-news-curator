from unittest.mock import MagicMock, patch

from app.services.url_validator import UnsafeURLError


async def test_ingest_success(client):
    mock_doc = MagicMock()
    mock_doc.title = "Test Article"
    mock_doc.text = "Article body content"
    mock_doc.author = "Test Author"
    mock_doc.date = "2026-01-15"
    mock_doc.image = "https://example.com/image.jpg"

    with (
        patch("app.services.ingest_service.safe_fetch", return_value="<html>content</html>"),
        patch("app.services.ingest_service.bare_extraction", return_value=mock_doc),
    ):
        response = await client.post("/ingest", json={"url": "https://example.com/article"})

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Test Article"
    assert data["body"] == "Article body content"
    assert data["author"] == "Test Author"
    assert data["published_at"] == "2026-01-15"
    assert data["og_image_url"] == "https://example.com/image.jpg"


async def test_ingest_fetch_failure(client):
    with patch("app.services.ingest_service.safe_fetch", return_value=None):
        response = await client.post("/ingest", json={"url": "https://invalid.example.com"})

    assert response.status_code == 422
    assert "Failed to extract" in response.json()["detail"]


async def test_ingest_extract_failure(client):
    with (
        patch("app.services.ingest_service.safe_fetch", return_value="<html>content</html>"),
        patch("app.services.ingest_service.bare_extraction", return_value=None),
    ):
        response = await client.post("/ingest", json={"url": "https://example.com/empty"})

    assert response.status_code == 422
    assert "Failed to extract" in response.json()["detail"]


async def test_ingest_invalid_url(client):
    response = await client.post("/ingest", json={"url": "not-a-url"})
    assert response.status_code == 422


async def test_ingest_private_ip(client):
    """SSRF: private IP should return 400."""
    with patch(
        "app.services.ingest_service.safe_fetch",
        side_effect=UnsafeURLError("unsafe"),
    ):
        response = await client.post("/ingest", json={"url": "http://192.168.1.1/article"})

    assert response.status_code == 400
    assert "private or reserved" in response.json()["detail"]


async def test_ingest_loopback(client):
    """SSRF: loopback should return 400."""
    with patch(
        "app.services.ingest_service.safe_fetch",
        side_effect=UnsafeURLError("unsafe"),
    ):
        response = await client.post("/ingest", json={"url": "http://127.0.0.1/secret"})

    assert response.status_code == 400
    assert "private or reserved" in response.json()["detail"]


async def test_ingest_link_local(client):
    """SSRF: link-local (metadata endpoint) should return 400."""
    with patch(
        "app.services.ingest_service.safe_fetch",
        side_effect=UnsafeURLError("unsafe"),
    ):
        response = await client.post("/ingest", json={"url": "http://169.254.169.254/"})

    assert response.status_code == 400
    assert "private or reserved" in response.json()["detail"]
