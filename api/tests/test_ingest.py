from unittest.mock import MagicMock, patch


async def test_ingest_success(client):
    mock_doc = MagicMock()
    mock_doc.title = "Test Article"
    mock_doc.text = "Article body content"
    mock_doc.author = "Test Author"
    mock_doc.date = "2026-01-15"
    mock_doc.image = "https://example.com/image.jpg"

    with (
        patch("app.services.ingest_service.fetch_url", return_value="<html>content</html>"),
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
    with patch("app.services.ingest_service.fetch_url", return_value=None):
        response = await client.post("/ingest", json={"url": "https://invalid.example.com"})

    assert response.status_code == 422
    assert "Failed to extract" in response.json()["detail"]


async def test_ingest_extract_failure(client):
    with (
        patch("app.services.ingest_service.fetch_url", return_value="<html>content</html>"),
        patch("app.services.ingest_service.bare_extraction", return_value=None),
    ):
        response = await client.post("/ingest", json={"url": "https://example.com/empty"})

    assert response.status_code == 422
    assert "Failed to extract" in response.json()["detail"]


async def test_ingest_invalid_url(client):
    response = await client.post("/ingest", json={"url": "not-a-url"})
    assert response.status_code == 422
