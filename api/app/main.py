from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import async_engine
from app.routers import articles, digest, health, ingest


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await async_engine.dispose()


app = FastAPI(
    title="Tech News Curator API",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(articles.router)
app.include_router(digest.router)
