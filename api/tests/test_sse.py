"""Tests for SSE broker, article monitor, and endpoint."""

import asyncio
from unittest.mock import AsyncMock, patch

from app.services.sse_broker import SSEBroker


async def test_sse_endpoint_returns_event_stream(client):
    """SSE endpoint should return text/event-stream content type."""

    async def check_headers():
        async with client.stream("GET", "/articles/stream") as response:
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")

    task = asyncio.create_task(check_headers())
    # Give enough time for headers to arrive, then cancel the infinite stream
    await asyncio.sleep(0.5)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


async def test_sse_broker_broadcast():
    """Broker should deliver events to all subscribers."""
    broker = SSEBroker()
    q1 = broker.subscribe()
    q2 = broker.subscribe()

    event = {"id": "1", "title_ja": "テスト記事"}
    await broker.broadcast(event)

    assert await q1.get() == event
    assert await q2.get() == event


async def test_sse_broker_unsubscribe():
    """Unsubscribed queues should not receive events."""
    broker = SSEBroker()
    q1 = broker.subscribe()
    broker.unsubscribe(q1)

    await broker.broadcast({"id": "1"})

    assert q1.empty()
    assert broker.client_count == 0


async def test_sse_broker_queue_full_drops_event():
    """Events should be dropped when queue is full."""
    broker = SSEBroker()
    q = broker.subscribe()

    # Fill the queue
    for i in range(64):
        q.put_nowait({"id": str(i)})

    # This should not raise, just drop
    await broker.broadcast({"id": "overflow"})

    assert q.qsize() == 64


async def test_article_monitor_skips_when_no_clients():
    """Monitor should not query DB when no SSE clients are connected."""
    with patch("app.services.article_monitor.AsyncSessionFactory") as mock_factory:
        from app.services.article_monitor import article_monitor

        # Run one iteration then cancel
        task = asyncio.create_task(article_monitor())
        await asyncio.sleep(0.1)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        mock_factory.assert_not_called()
