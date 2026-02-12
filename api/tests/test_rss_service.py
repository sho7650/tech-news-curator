"""Unit tests for rss_service (direct DB session)."""

import uuid
from datetime import datetime, timezone
from xml.etree import ElementTree

from app.schemas.article import ArticleCreate
from app.services.article_service import create_article
from app.services.rss_service import generate_rss_feed


def _make_article_data(**overrides) -> ArticleCreate:
    defaults = {
        "source_url": f"https://example.com/{uuid.uuid4()}",
        "source_name": "TestSource",
        "title_original": "Original Title",
        "title_ja": "テストタイトル",
        "body_original": "Original body",
        "body_translated": "翻訳本文",
        "summary_ja": "テスト要約",
        "author": "Author",
        "published_at": datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return ArticleCreate(**defaults)


async def test_generate_rss_feed_empty(db_session):
    """記事なしでも有効な XML を生成する。"""
    xml_str = await generate_rss_feed(db_session)
    assert xml_str.strip().startswith("<?xml")
    root = ElementTree.fromstring(xml_str)
    assert root.tag == "rss"
    channel = root.find("channel")
    assert channel is not None
    assert channel.find("title").text == "Tech News Curator"


async def test_generate_rss_feed_entries(db_session):
    """記事がエントリとして含まれる。"""
    data = _make_article_data(
        source_url="https://example.com/rss-test",
        title_ja="RSSテスト記事",
        summary_ja="RSSテスト要約",
    )
    await create_article(db_session, data)
    await db_session.commit()

    xml_str = await generate_rss_feed(db_session)
    root = ElementTree.fromstring(xml_str)
    items = root.findall(".//item")
    assert len(items) == 1
    assert items[0].find("title").text == "RSSテスト記事"
    assert items[0].find("description").text == "RSSテスト要約"


async def test_generate_rss_feed_encoding(db_session):
    """UTF-8 日本語テキストが正しくエンコードされる。"""
    data = _make_article_data(
        source_url="https://example.com/encoding-test",
        title_ja="日本語テスト",
        summary_ja="日本語要約テスト",
    )
    await create_article(db_session, data)
    await db_session.commit()

    xml_str = await generate_rss_feed(db_session)
    assert "日本語テスト" in xml_str
    assert "日本語要約テスト" in xml_str
