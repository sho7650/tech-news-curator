import uuid


SAMPLE_ARTICLE = {
    "source_url": "https://example.com/article-1",
    "source_name": "TechCrunch",
    "title_original": "Original Title",
    "title_ja": "日本語タイトル",
    "body_original": "Original body",
    "body_translated": "翻訳本文",
    "summary_ja": "日本語要約",
    "author": "John Doe",
    "published_at": "2026-01-15T10:00:00Z",
    "og_image_url": "https://example.com/image.jpg",
    "categories": ["AI", "Startups"],
    "metadata": {"source_feed": "main"},
}


async def test_create_article(client):
    response = await client.post("/articles", json=SAMPLE_ARTICLE)
    assert response.status_code == 201
    data = response.json()
    assert data["source_url"] == SAMPLE_ARTICLE["source_url"]
    assert data["title_ja"] == SAMPLE_ARTICLE["title_ja"]
    assert "id" in data
    uuid.UUID(data["id"])  # validates UUID format


async def test_create_article_duplicate(client):
    await client.post("/articles", json=SAMPLE_ARTICLE)
    response = await client.post("/articles", json=SAMPLE_ARTICLE)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


async def test_check_article_exists(client):
    await client.post("/articles", json=SAMPLE_ARTICLE)
    response = await client.get("/articles/check", params={"url": SAMPLE_ARTICLE["source_url"]})
    assert response.status_code == 200
    assert response.json()["exists"] is True


async def test_check_article_not_exists(client):
    response = await client.get("/articles/check", params={"url": "https://nonexistent.example.com"})
    assert response.status_code == 200
    assert response.json()["exists"] is False


async def test_list_articles(client):
    for i in range(3):
        article = SAMPLE_ARTICLE.copy()
        article["source_url"] = f"https://example.com/article-{i}"
        await client.post("/articles", json=article)

    response = await client.get("/articles", params={"page": 1, "per_page": 2})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert data["page"] == 1
    assert data["per_page"] == 2
    assert len(data["items"]) == 2


async def test_list_articles_date_filter(client):
    article1 = SAMPLE_ARTICLE.copy()
    article1["source_url"] = "https://example.com/jan15"
    article1["published_at"] = "2026-01-15T10:00:00Z"

    article2 = SAMPLE_ARTICLE.copy()
    article2["source_url"] = "https://example.com/jan16"
    article2["published_at"] = "2026-01-16T10:00:00Z"

    await client.post("/articles", json=article1)
    await client.post("/articles", json=article2)

    response = await client.get("/articles", params={"date": "2026-01-15"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["source_url"] == "https://example.com/jan15"


async def test_get_article_detail(client):
    create_response = await client.post("/articles", json=SAMPLE_ARTICLE)
    article_id = create_response.json()["id"]

    response = await client.get(f"/articles/{article_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == article_id
    assert data["source_url"] == SAMPLE_ARTICLE["source_url"]
    assert data["title_original"] == SAMPLE_ARTICLE["title_original"]
    assert data["metadata"] == SAMPLE_ARTICLE["metadata"]


async def test_get_article_not_found(client):
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/articles/{fake_id}")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]
