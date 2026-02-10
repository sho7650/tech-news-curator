from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.digest import Digest
from app.schemas.digest import DigestCreate


async def create_digest(session: AsyncSession, data: DigestCreate) -> Digest:
    digest = Digest(**data.model_dump())
    session.add(digest)
    await session.flush()
    return digest


async def get_digests(
    session: AsyncSession,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Digest], int]:
    count_result = await session.execute(select(func.count()).select_from(Digest))
    total = count_result.scalar_one()

    result = await session.execute(
        select(Digest)
        .order_by(Digest.digest_date.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    digests = list(result.scalars().all())
    return digests, total


async def get_digest_by_date(session: AsyncSession, digest_date: date) -> Digest | None:
    result = await session.execute(
        select(Digest).where(Digest.digest_date == digest_date)
    )
    return result.scalar_one_or_none()
