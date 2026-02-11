import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.database import Base, get_session, settings
from app.main import app

TEST_API_KEY = "test-key-for-testing"


@pytest.fixture(scope="session")
def postgres_container():
    """Share a single PostgreSQL container across the entire test session.

    Use driver=None to avoid greenlet errors during the sync health check.
    The asyncpg driver is specified when getting the connection URL.
    """
    with PostgresContainer("postgres:16", driver=None) as postgres:
        yield postgres


@pytest.fixture(scope="function")
async def db_engine(postgres_container):
    """Recreate tables for each test to ensure isolation."""
    url = postgres_container.get_connection_url(driver="asyncpg")
    engine = create_async_engine(url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="function")
async def db_session(db_engine):
    session_factory = async_sessionmaker(
        bind=db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with session_factory() as session:
        yield session


@pytest.fixture(scope="function")
async def client(db_session):
    app.dependency_overrides[get_session] = lambda: db_session
    original_api_keys = settings.api_keys
    settings.api_keys = [TEST_API_KEY]
    # Disable rate limiting in tests
    app.state.limiter.enabled = False
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-API-Key": TEST_API_KEY},
    ) as ac:
        yield ac
    app.state.limiter.enabled = True
    settings.api_keys = original_api_keys
    app.dependency_overrides.clear()
