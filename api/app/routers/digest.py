from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
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
async def create_digest_endpoint(
    data: DigestCreate,
    session: AsyncSession = Depends(get_session),
):
    try:
        digest = await create_digest(session, data)
        return digest
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Digest for this date already exists")


@router.get("", response_model=DigestListResponse)
async def list_digests(
    session: AsyncSession = Depends(get_session),
):
    digests, total = await get_digests(session)
    return DigestListResponse(items=digests, total=total)


@router.get("/{digest_date}", response_model=DigestResponse)
async def get_digest(
    digest_date: date,
    session: AsyncSession = Depends(get_session),
):
    digest = await get_digest_by_date(session, digest_date)
    if digest is None:
        raise HTTPException(status_code=404, detail="Digest not found")
    return digest
