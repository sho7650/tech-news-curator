import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.requests import Request

from app.database import async_engine, settings
from app.middleware import SecurityHeadersMiddleware
from app.rate_limit import limiter
from app.routers import articles, digest, feed, health, ingest, sources, sse

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_production()

    from app.services.article_monitor import article_monitor

    monitor_task = asyncio.create_task(article_monitor())

    yield

    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass
    await async_engine.dispose()


app = FastAPI(
    title="Tech News Curator API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None if settings.environment == "production" else "/docs",
    redoc_url=None if settings.environment == "production" else "/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middleware order (Starlette LIFO): CORSMiddleware → SecurityHeaders → SlowAPI
# Added in reverse order so CORS runs outermost
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Accept", "X-API-Key"],
)


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    if isinstance(exc, IntegrityError):
        return JSONResponse(status_code=409, content={"detail": "Resource conflict"})
    logger.exception("Database error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(
    sse.router
)  # before articles (avoids /articles/{id} catching /articles/stream)
app.include_router(articles.router)
app.include_router(digest.router)
app.include_router(sources.router)
app.include_router(feed.router)
