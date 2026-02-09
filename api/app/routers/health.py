from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(session: AsyncSession = Depends(get_session)):
    try:
        await session.execute(text("SELECT 1"))
        return HealthResponse(status="healthy", db="connected")
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "db": "disconnected"},
        )
