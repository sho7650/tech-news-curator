from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.database import get_session
from app.rate_limit import limiter
from app.services.rss_service import generate_rss_feed

router = APIRouter(prefix="/feed", tags=["feed"])


@router.get("/rss")
@limiter.limit("30/minute")
async def rss_feed(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    rss_xml = await generate_rss_feed(session)
    return Response(
        content=rss_xml,
        media_type="application/rss+xml; charset=utf-8",
    )
