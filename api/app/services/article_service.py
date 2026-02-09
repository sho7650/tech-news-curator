import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.schemas.article import ArticleCreate


async def check_article_exists(session: AsyncSession, url: str) -> bool:
    result = await session.execute(
        select(func.count()).where(Article.source_url == url)
    )
    return result.scalar_one() > 0


async def create_article(session: AsyncSession, data: ArticleCreate) -> Article:
    dump = data.model_dump()
    dump["metadata_"] = dump.pop("metadata")
    article = Article(**dump)
    session.add(article)
    await session.flush()
    return article


async def get_articles(
    session: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    date_filter: Optional[date] = None,
) -> tuple[list[Article], int]:
    query = select(Article)

    if date_filter:
        start = datetime(date_filter.year, date_filter.month, date_filter.day, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        query = query.where(Article.published_at >= start, Article.published_at < end)

    count_result = await session.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar_one()

    query = query.order_by(Article.published_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await session.execute(query)
    articles = list(result.scalars().all())

    return articles, total


async def get_article_by_id(session: AsyncSession, article_id: uuid.UUID) -> Article | None:
    result = await session.execute(
        select(Article).where(Article.id == article_id)
    )
    return result.scalar_one_or_none()
