"""Unit tests for source_service (direct DB session, no HTTP client)."""

import uuid

from app.models.source import Source
from app.schemas.source import SourceCreate, SourceUpdate
from app.services.source_service import (
    create_source,
    deactivate_source,
    get_source_by_id,
    get_sources,
    update_source,
)


def _make_source_data(**overrides) -> SourceCreate:
    defaults = {
        "name": "TechCrunch",
        "rss_url": f"https://example.com/feed/{uuid.uuid4()}",
        "site_url": "https://example.com",
        "category": "general",
    }
    defaults.update(overrides)
    return SourceCreate(**defaults)


async def test_create_source_service(db_session):
    data = _make_source_data()
    source = await create_source(db_session, data)
    await db_session.commit()

    assert source.id is not None
    assert source.name == data.name
    assert source.rss_url == str(data.rss_url)
    assert source.is_active is True


async def test_get_sources_service(db_session):
    for i in range(3):
        data = _make_source_data(
            name=f"Source {i}",
            rss_url=f"https://example.com/feed/{i}",
        )
        await create_source(db_session, data)
    await db_session.commit()

    sources, total = await get_sources(db_session)
    assert total == 3
    assert len(sources) == 3


async def test_get_sources_active_only(db_session):
    data1 = _make_source_data(name="Active Source")
    source1 = await create_source(db_session, data1)

    data2 = _make_source_data(name="Inactive Source")
    source2 = await create_source(db_session, data2)
    source2.is_active = False
    await db_session.commit()

    sources, total = await get_sources(db_session, active_only=True)
    assert total == 1
    assert sources[0].name == "Active Source"


async def test_get_source_by_id(db_session):
    data = _make_source_data()
    source = await create_source(db_session, data)
    await db_session.commit()

    found = await get_source_by_id(db_session, source.id)
    assert found is not None
    assert found.id == source.id
    assert found.name == source.name


async def test_get_source_by_id_not_found(db_session):
    found = await get_source_by_id(db_session, uuid.uuid4())
    assert found is None


async def test_update_source_partial(db_session):
    data = _make_source_data(name="Original Name", category="tech")
    source = await create_source(db_session, data)
    await db_session.commit()

    update_data = SourceUpdate(name="Updated Name")
    updated = await update_source(db_session, source, update_data)
    await db_session.commit()

    assert updated.name == "Updated Name"
    assert updated.category == "tech"  # unchanged


async def test_deactivate_source(db_session):
    data = _make_source_data()
    source = await create_source(db_session, data)
    await db_session.commit()

    assert source.is_active is True
    deactivated = await deactivate_source(db_session, source)
    await db_session.commit()

    assert deactivated.is_active is False
