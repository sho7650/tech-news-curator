"""Background task: poll DB for new articles and notify SSE broker."""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionFactory
from app.models.article import Article
from app.services.sse_broker import article_broker

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 5


async def article_monitor() -> None:
    """Monitor for new articles and broadcast to SSE clients.

    Started in lifespan startup, cancelled on shutdown.
    """
    last_checked = datetime.now(timezone.utc)

    while True:
        try:
            if article_broker.client_count > 0:
                async with AsyncSessionFactory() as session:
                    result = await session.execute(
                        select(Article)
                        .where(Article.created_at > last_checked)
                        .order_by(Article.created_at.asc())
                    )
                    articles = result.scalars().all()

                    for article in articles:
                        await article_broker.broadcast(
                            {
                                "id": str(article.id),
                                "source_url": article.source_url,
                                "source_name": article.source_name,
                                "title_ja": article.title_ja,
                                "summary_ja": article.summary_ja,
                                "author": article.author,
                                "published_at": (
                                    article.published_at.isoformat()
                                    if article.published_at
                                    else None
                                ),
                                "og_image_url": article.og_image_url,
                                "categories": article.categories,
                                "created_at": article.created_at.isoformat(),
                            }
                        )

                    if articles:
                        last_checked = articles[-1].created_at
            else:
                # No clients connected: advance last_checked to prevent
                # flooding old articles when the first client connects.
                last_checked = datetime.now(timezone.utc)
        except Exception:
            logger.exception("article_monitor: polling error")

        await asyncio.sleep(POLL_INTERVAL_SECONDS)
