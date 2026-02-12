from feedgen.feed import FeedGenerator
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import settings
from app.services.article_service import get_articles


async def generate_rss_feed(session: AsyncSession) -> str:
    """最新記事から RSS 2.0 XML を生成する。"""
    articles, _ = await get_articles(session, page=1, per_page=20)

    fg = FeedGenerator()
    fg.title("Tech News Curator")
    fg.link(href=settings.public_url, rel="alternate")
    fg.description("海外テックニュースの日本語要約")
    fg.language("ja")

    for article in articles:
        fe = fg.add_entry()
        fe.id(str(article.id))
        fe.title(article.title_ja or article.title_original or "Untitled")
        fe.link(href=article.source_url)
        if article.summary_ja:
            fe.description(article.summary_ja)
        if article.published_at:
            fe.pubDate(article.published_at)
        if article.author:
            fe.author(name=article.author)

    return fg.rss_str(pretty=True).decode("utf-8")
