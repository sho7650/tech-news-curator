from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Security
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.database import get_session
from app.dependencies import verify_api_key
from app.rate_limit import limiter
from app.schemas.digest import (
    DigestCreate,
    DigestListResponse,
    DigestResponse,
)
from app.services.digest_service import (
    create_digest,
    get_digest_by_date,
    get_digests,
)

router = APIRouter(prefix="/digest", tags=["digest"])


@router.post("", response_model=DigestResponse, status_code=201)
@limiter.limit("5/minute")
async def create_digest_endpoint(
    request: Request,
    data: DigestCreate,
    session: AsyncSession = Depends(get_session),
    _api_key: str = Security(verify_api_key),
):
    try:
        digest = await create_digest(session, data)
        return digest
    except IntegrityError:
        raise HTTPException(
            status_code=409, detail="Digest for this date already exists"
        )


@router.get("", response_model=DigestListResponse)
@limiter.limit("60/minute")
async def list_digests(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    digests, total = await get_digests(session, page, per_page)
    return DigestListResponse(items=digests, total=total, page=page, per_page=per_page)


@router.get("/{digest_date}", response_model=DigestResponse)
@limiter.limit("60/minute")
async def get_digest(
    request: Request,
    digest_date: date,
    session: AsyncSession = Depends(get_session),
):
    digest = await get_digest_by_date(session, digest_date)
    if digest is None:
        raise HTTPException(status_code=404, detail="Digest not found")
    return digest
