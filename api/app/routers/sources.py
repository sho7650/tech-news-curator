import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Security
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.database import get_session
from app.dependencies import verify_api_key
from app.rate_limit import limiter
from app.schemas.source import (
    SourceCreate,
    SourceListResponse,
    SourceResponse,
    SourceUpdate,
)
from app.services.source_service import (
    create_source,
    deactivate_source,
    get_source_by_id,
    get_sources,
    update_source,
)

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=SourceListResponse)
@limiter.limit("60/minute")
async def list_sources(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    active_only: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    sources, total = await get_sources(session, page, per_page, active_only)
    return SourceListResponse(items=sources, total=total, page=page, per_page=per_page)


@router.post("", response_model=SourceResponse, status_code=201)
@limiter.limit("10/minute")
async def create_source_endpoint(
    request: Request,
    data: SourceCreate,
    session: AsyncSession = Depends(get_session),
    _api_key: str = Security(verify_api_key),
):
    try:
        source = await create_source(session, data)
        return source
    except IntegrityError:
        raise HTTPException(
            status_code=409, detail="Source with this RSS URL already exists"
        )


@router.put("/{source_id}", response_model=SourceResponse)
@limiter.limit("10/minute")
async def update_source_endpoint(
    request: Request,
    source_id: uuid.UUID,
    data: SourceUpdate,
    session: AsyncSession = Depends(get_session),
    _api_key: str = Security(verify_api_key),
):
    source = await get_source_by_id(session, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    try:
        updated = await update_source(session, source, data)
        return updated
    except IntegrityError:
        raise HTTPException(
            status_code=409, detail="Source with this RSS URL already exists"
        )


@router.delete("/{source_id}", response_model=SourceResponse)
@limiter.limit("10/minute")
async def delete_source_endpoint(
    request: Request,
    source_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _api_key: str = Security(verify_api_key),
):
    source = await get_source_by_id(session, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")
    deactivated = await deactivate_source(session, source)
    return deactivated
