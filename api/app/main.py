from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import async_engine
from app.routers import articles, digest, health, ingest


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.database import settings
    settings.validate_production()
    yield
    await async_engine.dispose()


app = FastAPI(
    title="Tech News Curator API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3100", "http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(articles.router)
app.include_router(digest.router)
