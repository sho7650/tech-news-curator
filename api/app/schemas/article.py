import uuid
from datetime import datetime
from typing import Optional

from pydantic import Field

from app.schemas import AppBaseModel


class ArticleCreate(AppBaseModel):
    """POST /articles request body (called from n8n).

    published_at is received as ISO8601 UTC datetime (e.g. "2026-01-01T00:00:00Z").
    n8n converts the /ingest published_at string to datetime before sending.
    """

    source_url: str
    source_name: Optional[str] = None
    title_original: Optional[str] = None
    title_ja: Optional[str] = None
    body_original: Optional[str] = None
    body_translated: Optional[str] = None
    summary_ja: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    og_image_url: Optional[str] = None
    categories: Optional[list[str]] = None
    metadata: Optional[dict] = None


class ArticleListItem(AppBaseModel):
    """GET /articles response item (summary only)."""

    id: uuid.UUID
    source_url: str
    source_name: Optional[str] = None
    title_ja: Optional[str] = None
    summary_ja: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    og_image_url: Optional[str] = None
    categories: Optional[list[str]] = None
    created_at: datetime


class ArticleDetail(AppBaseModel):
    """GET /articles/{id} response (detail with translated body)."""

    id: uuid.UUID
    source_url: str
    source_name: Optional[str] = None
    title_original: Optional[str] = None
    title_ja: Optional[str] = None
    body_translated: Optional[str] = None
    summary_ja: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    og_image_url: Optional[str] = None
    categories: Optional[list[str]] = None
    metadata: Optional[dict] = Field(None, validation_alias="metadata_")
    created_at: datetime


class ArticleListResponse(AppBaseModel):
    """GET /articles paginated response."""

    items: list[ArticleListItem]
    total: int
    page: int
    per_page: int


class ArticleCheckResponse(AppBaseModel):
    """GET /articles/check response."""

    exists: bool
