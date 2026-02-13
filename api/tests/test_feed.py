"""Integration tests for /feed/rss endpoint."""

from xml.etree import ElementTree

SAMPLE_ARTICLE = {
    "source_url": "https://example.com/feed-test",
    "source_name": "TechCrunch",
    "title_original": "Original Title",
    "title_ja": "日本語タイトル",
    "body_original": "Original body",
    "body_translated": "翻訳本文",
    "summary_ja": "日本語要約",
    "author": "John Doe",
    "published_at": "2026-01-15T10:00:00Z",
    "categories": ["AI"],
}


async def test_rss_feed_empty(client):
    """記事なしで空フィードを返す。"""
    response = await client.get("/feed/rss")
    assert response.status_code == 200
    root = ElementTree.fromstring(response.text)
    assert root.tag == "rss"
    items = root.findall(".//item")
    assert len(items) == 0


async def test_rss_feed_content(client):
    """記事ありで正しい RSS 2.0 XML を返す。"""
    await client.post("/articles", json=SAMPLE_ARTICLE)

    response = await client.get("/feed/rss")
    assert response.status_code == 200
    root = ElementTree.fromstring(response.text)
    assert root.tag == "rss"
    items = root.findall(".//item")
    assert len(items) == 1
    assert items[0].find("title").text == "日本語タイトル"
    assert items[0].find("description").text == "日本語要約"


async def test_rss_feed_content_type(client):
    """Content-Type が application/rss+xml。"""
    response = await client.get("/feed/rss")
    assert "application/rss+xml" in response.headers["content-type"]


async def test_rss_feed_excludes_body(client):
    """body_original, body_translated がフィードに含まれない。"""
    await client.post("/articles", json=SAMPLE_ARTICLE)

    response = await client.get("/feed/rss")
    assert "Original body" not in response.text
    assert "翻訳本文" not in response.text


async def test_rss_feed_max_items(client):
    """最大 20 件の記事を含む。"""
    for i in range(25):
        article = SAMPLE_ARTICLE.copy()
        article["source_url"] = f"https://example.com/feed-max-{i}"
        await client.post("/articles", json=article)

    response = await client.get("/feed/rss")
    root = ElementTree.fromstring(response.text)
    items = root.findall(".//item")
    assert len(items) == 20
