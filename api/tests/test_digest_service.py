"""Unit tests for digest_service (direct DB session, no HTTP client)."""

from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.schemas.digest import DigestCreate
from app.services.digest_service import (
    create_digest,
    get_digest_by_date,
    get_digests,
)


def _make_digest_data(**overrides) -> DigestCreate:
    defaults = {
        "digest_date": date(2026, 1, 15),
        "title": "テストダイジェスト",
        "content": "ダイジェスト内容",
        "article_count": 5,
    }
    defaults.update(overrides)
    return DigestCreate(**defaults)


async def test_create_digest_success(db_session):
    data = _make_digest_data()
    digest = await create_digest(db_session, data)
    await db_session.commit()

    assert digest.id is not None
    assert digest.digest_date == date(2026, 1, 15)
    assert digest.title == "テストダイジェスト"


async def test_create_digest_duplicate_date(db_session):
    data1 = _make_digest_data()
    await create_digest(db_session, data1)
    await db_session.commit()

    data2 = _make_digest_data(title="別のダイジェスト")
    with pytest.raises(IntegrityError):
        await create_digest(db_session, data2)
        await db_session.commit()


async def test_get_digests_pagination(db_session):
    for i in range(5):
        data = _make_digest_data(digest_date=date(2026, 1, 15 + i))
        await create_digest(db_session, data)
    await db_session.commit()

    digests, total = await get_digests(db_session, page=1, per_page=2)
    assert total == 5
    assert len(digests) == 2


async def test_get_digests_ordering(db_session):
    for i in range(3):
        data = _make_digest_data(digest_date=date(2026, 1, 15 + i))
        await create_digest(db_session, data)
    await db_session.commit()

    digests, _ = await get_digests(db_session)
    # Should be sorted by digest_date descending
    assert digests[0].digest_date == date(2026, 1, 17)
    assert digests[1].digest_date == date(2026, 1, 16)
    assert digests[2].digest_date == date(2026, 1, 15)


async def test_get_digest_by_date_found(db_session):
    data = _make_digest_data()
    await create_digest(db_session, data)
    await db_session.commit()

    result = await get_digest_by_date(db_session, date(2026, 1, 15))
    assert result is not None
    assert result.digest_date == date(2026, 1, 15)


async def test_get_digest_by_date_not_found(db_session):
    result = await get_digest_by_date(db_session, date(2099, 12, 31))
    assert result is None
