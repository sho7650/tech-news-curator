import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import async_engine, settings
from app.routers import articles, digest, health, ingest, sse


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
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Accept", "X-API-Key"],
)

app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(sse.router)       # before articles (avoids /articles/{id} catching /articles/stream)
app.include_router(articles.router)
app.include_router(digest.router)
