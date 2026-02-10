import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.article import (
    ArticleCheckResponse,
    ArticleCreate,
    ArticleDetail,
    ArticleListResponse,
)
from app.services.article_service import (
    check_article_exists,
    create_article,
    get_article_by_id,
    get_articles,
)

router = APIRouter(prefix="/articles", tags=["articles"])


@router.get("/check", response_model=ArticleCheckResponse)
async def check_article(
    url: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    exists = await check_article_exists(session, url)
    return ArticleCheckResponse(exists=exists)


@router.post("", response_model=ArticleDetail, status_code=201)
async def create_article_endpoint(
    data: ArticleCreate,
    session: AsyncSession = Depends(get_session),
):
    try:
        article = await create_article(session, data)
        return article
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Article with this URL already exists")


@router.get("", response_model=ArticleListResponse)
async def list_articles(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    session: AsyncSession = Depends(get_session),
):
    date_filter = None
    if date:
        date_filter = _parse_date(date)

    articles, total = await get_articles(session, page, per_page, date_filter)
    return ArticleListResponse(
        items=articles,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{article_id}", response_model=ArticleDetail)
async def get_article(
    article_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    article = await get_article_by_id(session, article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


def _parse_date(date_str: str) -> date:
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {date_str}")
