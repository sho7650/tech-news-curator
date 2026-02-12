"""Unit tests for article_monitor background task."""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.article_monitor import article_monitor
from app.services.sse_broker import SSEBroker, article_broker


async def test_monitor_broadcasts_new_articles(db_session):
    """When clients are connected and new articles exist, they get broadcast."""
    mock_broker = MagicMock(spec=SSEBroker)
    mock_broker.client_count = 1
    mock_broker.broadcast = AsyncMock()

    mock_article = MagicMock()
    mock_article.id = "test-uuid"
    mock_article.source_url = "https://example.com"
    mock_article.source_name = "Test"
    mock_article.title_ja = "テスト"
    mock_article.summary_ja = "要約"
    mock_article.author = "Author"
    mock_article.published_at = datetime(2026, 1, 15, tzinfo=timezone.utc)
    mock_article.og_image_url = None
    mock_article.categories = ["AI"]
    mock_article.created_at = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_article]

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("app.services.article_monitor.article_broker", mock_broker),
        patch(
            "app.services.article_monitor.AsyncSessionFactory",
            return_value=mock_session,
        ),
        patch("app.services.article_monitor.POLL_INTERVAL_SECONDS", 0),
    ):
        task = asyncio.create_task(article_monitor())
        await asyncio.sleep(0.1)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    mock_broker.broadcast.assert_called()
    call_args = mock_broker.broadcast.call_args[0][0]
    assert call_args["id"] == "test-uuid"
    assert call_args["title_ja"] == "テスト"


async def test_monitor_skips_when_no_clients():
    """When no SSE clients are connected, DB query is skipped."""
    mock_broker = MagicMock(spec=SSEBroker)
    mock_broker.client_count = 0

    mock_session_factory = MagicMock()

    with (
        patch("app.services.article_monitor.article_broker", mock_broker),
        patch("app.services.article_monitor.AsyncSessionFactory", mock_session_factory),
        patch("app.services.article_monitor.POLL_INTERVAL_SECONDS", 0),
    ):
        task = asyncio.create_task(article_monitor())
        await asyncio.sleep(0.1)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    # Session factory should never be called since no clients
    mock_session_factory.assert_not_called()


async def test_monitor_recovers_from_db_error():
    """Monitor continues polling after a DB error."""
    mock_broker = MagicMock(spec=SSEBroker)
    mock_broker.client_count = 1

    call_count = 0
    mock_session = AsyncMock()

    async def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        raise Exception("DB connection failed")

    mock_session.execute = side_effect
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("app.services.article_monitor.article_broker", mock_broker),
        patch(
            "app.services.article_monitor.AsyncSessionFactory",
            return_value=mock_session,
        ),
        patch("app.services.article_monitor.POLL_INTERVAL_SECONDS", 0),
    ):
        task = asyncio.create_task(article_monitor())
        await asyncio.sleep(0.2)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    # Should have attempted multiple polls despite errors
    assert call_count >= 2
