import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.source import Source
from app.schemas.source import SourceCreate, SourceUpdate


async def create_source(session: AsyncSession, data: SourceCreate) -> Source:
    dump = data.model_dump()
    dump["rss_url"] = str(data.rss_url)
    if data.site_url:
        dump["site_url"] = str(data.site_url)
    source = Source(**dump)
    session.add(source)
    await session.flush()
    return source


async def get_sources(
    session: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    active_only: bool = False,
) -> tuple[list[Source], int]:
    query = select(Source)
    if active_only:
        query = query.where(Source.is_active.is_(True))

    count_result = await session.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = count_result.scalar_one()

    result = await session.execute(
        query.order_by(Source.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    sources = list(result.scalars().all())
    return sources, total


async def get_source_by_id(
    session: AsyncSession, source_id: uuid.UUID
) -> Source | None:
    result = await session.execute(select(Source).where(Source.id == source_id))
    return result.scalar_one_or_none()


async def update_source(
    session: AsyncSession,
    source: Source,
    data: SourceUpdate,
) -> Source:
    update_data = data.model_dump(exclude_unset=True)
    if "rss_url" in update_data and update_data["rss_url"] is not None:
        update_data["rss_url"] = str(update_data["rss_url"])
    if "site_url" in update_data and update_data["site_url"] is not None:
        update_data["site_url"] = str(update_data["site_url"])
    for key, value in update_data.items():
        setattr(source, key, value)
    await session.flush()
    return source


async def deactivate_source(
    session: AsyncSession,
    source: Source,
) -> Source:
    source.is_active = False
    await session.flush()
    return source
