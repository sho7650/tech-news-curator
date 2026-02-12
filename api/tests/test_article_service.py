"""Unit tests for article_service (direct DB session, no HTTP client)."""

import uuid
from datetime import date, datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.schemas.article import ArticleCreate
from app.services.article_service import (
    check_article_exists,
    create_article,
    get_articles,
)


def _make_article_data(**overrides) -> ArticleCreate:
    defaults = {
        "source_url": f"https://example.com/{uuid.uuid4()}",
        "source_name": "TestSource",
        "title_original": "Original Title",
        "title_ja": "テストタイトル",
        "body_original": "Original body",
        "body_translated": "翻訳本文",
        "summary_ja": "要約",
        "author": "Author",
        "published_at": datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return ArticleCreate(**defaults)


async def test_check_article_exists_true(db_session):
    data = _make_article_data(source_url="https://example.com/exists")
    await create_article(db_session, data)
    await db_session.commit()

    result = await check_article_exists(db_session, "https://example.com/exists")
    assert result is True


async def test_check_article_exists_false(db_session):
    result = await check_article_exists(db_session, "https://example.com/not-exists")
    assert result is False


async def test_create_article_success(db_session):
    data = _make_article_data()
    article = await create_article(db_session, data)
    await db_session.commit()

    assert article.id is not None
    assert article.source_url == str(data.source_url)
    assert article.title_ja == data.title_ja
    assert article.summary_ja == data.summary_ja


async def test_create_article_duplicate_url(db_session):
    url = "https://example.com/duplicate"
    data1 = _make_article_data(source_url=url)
    await create_article(db_session, data1)
    await db_session.commit()

    data2 = _make_article_data(source_url=url)
    with pytest.raises(IntegrityError):
        await create_article(db_session, data2)
        await db_session.commit()


async def test_get_articles_pagination(db_session):
    for i in range(5):
        data = _make_article_data(
            source_url=f"https://example.com/page-{i}",
            published_at=datetime(2026, 1, 15, 10 + i, 0, 0, tzinfo=timezone.utc),
        )
        await create_article(db_session, data)
    await db_session.commit()

    articles, total = await get_articles(db_session, page=1, per_page=2)
    assert total == 5
    assert len(articles) == 2

    articles2, total2 = await get_articles(db_session, page=2, per_page=2)
    assert total2 == 5
    assert len(articles2) == 2


async def test_get_articles_date_filter(db_session):
    data_jan15 = _make_article_data(
        source_url="https://example.com/jan15",
        published_at=datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    )
    data_jan16 = _make_article_data(
        source_url="https://example.com/jan16",
        published_at=datetime(2026, 1, 16, 10, 0, 0, tzinfo=timezone.utc),
    )
    await create_article(db_session, data_jan15)
    await create_article(db_session, data_jan16)
    await db_session.commit()

    # Filter for Jan 15 — half-open interval [2026-01-15, 2026-01-16)
    articles, total = await get_articles(db_session, date_filter=date(2026, 1, 15))
    assert total == 1
    assert articles[0].source_url == "https://example.com/jan15"


async def test_get_articles_category_filter(db_session):
    data_ai = _make_article_data(
        source_url="https://example.com/ai-article",
        categories=["ai", "startup"],
    )
    data_hw = _make_article_data(
        source_url="https://example.com/hw-article",
        categories=["hardware"],
    )
    await create_article(db_session, data_ai)
    await create_article(db_session, data_hw)
    await db_session.commit()

    articles, total = await get_articles(db_session, category_filter="ai")
    assert total == 1
    assert articles[0].source_url == "https://example.com/ai-article"


async def test_get_articles_category_and_date(db_session):
    data1 = _make_article_data(
        source_url="https://example.com/ai-jan15",
        categories=["ai"],
        published_at=datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    )
    data2 = _make_article_data(
        source_url="https://example.com/ai-jan16",
        categories=["ai"],
        published_at=datetime(2026, 1, 16, 10, 0, 0, tzinfo=timezone.utc),
    )
    data3 = _make_article_data(
        source_url="https://example.com/hw-jan15",
        categories=["hardware"],
        published_at=datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    )
    await create_article(db_session, data1)
    await create_article(db_session, data2)
    await create_article(db_session, data3)
    await db_session.commit()

    articles, total = await get_articles(
        db_session, date_filter=date(2026, 1, 15), category_filter="ai"
    )
    assert total == 1
    assert articles[0].source_url == "https://example.com/ai-jan15"
