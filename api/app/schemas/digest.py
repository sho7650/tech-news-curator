import uuid
from datetime import date, datetime
from typing import Optional

from app.schemas import AppBaseModel


class DigestCreate(AppBaseModel):
    """POST /digest request body."""

    digest_date: date
    title: Optional[str] = None
    content: Optional[str] = None
    article_count: Optional[int] = None
    article_ids: Optional[list[uuid.UUID]] = None


class DigestResponse(AppBaseModel):
    """GET /digest/{date} response."""

    id: uuid.UUID
    digest_date: date
    title: Optional[str] = None
    content: Optional[str] = None
    article_count: Optional[int] = None
    article_ids: Optional[list[uuid.UUID]] = None
    created_at: datetime


class DigestListItem(AppBaseModel):
    """GET /digest list response item."""

    id: uuid.UUID
    digest_date: date
    title: Optional[str] = None
    article_count: Optional[int] = None
    created_at: datetime


class DigestListResponse(AppBaseModel):
    """GET /digest paginated response."""

    items: list[DigestListItem]
    total: int
    page: int
    per_page: int
