"""SSE endpoint: real-time stream of new articles."""

import asyncio
import json

from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse, ServerSentEvent

from app.services.sse_broker import article_broker

router = APIRouter(tags=["sse"])


async def _article_stream(request: Request):
    """Per-client SSE generator."""
    queue = article_broker.subscribe()
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                yield ServerSentEvent(
                    data=json.dumps(event, ensure_ascii=False),
                    event="new_article",
                )
            except asyncio.TimeoutError:
                continue
    finally:
        article_broker.unsubscribe(queue)


@router.get("/articles/stream")
async def stream_articles(request: Request):
    """SSE stream of new articles.

    Connect with EventSource API:
      const es = new EventSource('/articles/stream')
      es.addEventListener('new_article', (e) => { ... })
    """
    return EventSourceResponse(
        _article_stream(request),
        ping=15,
    )
