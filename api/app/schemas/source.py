import uuid
from datetime import datetime
from typing import Optional

from pydantic import Field, HttpUrl, model_validator

from app.schemas import AppBaseModel


class SourceCreate(AppBaseModel):
    """POST /sources request body."""

    name: str = Field(..., min_length=1, max_length=100)
    rss_url: HttpUrl
    site_url: Optional[HttpUrl] = None
    category: Optional[str] = Field(None, max_length=50)


class SourceUpdate(AppBaseModel):
    """PUT /sources/{id} request body.

    全フィールド Optional で部分更新をサポート。
    exclude_unset=True で未送信フィールドは変更しない。
    rss_url/name は明示的 null 送信を禁止（DB NOT NULL 制約保護）。
    """

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    rss_url: Optional[HttpUrl] = None
    site_url: Optional[HttpUrl] = None
    category: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> "SourceUpdate":
        """rss_url, name が明示的に null で送信された場合を拒否する。

        exclude_unset=True では「未送信」と「null送信」を区別できるが、
        null が set された場合に DB の NOT NULL 制約で 500 になるのを防ぐ。
        model_fields_set で「送信されたが null」を検出する。
        """
        if "rss_url" in self.model_fields_set and self.rss_url is None:
            raise ValueError("rss_url cannot be null")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self


class SourceResponse(AppBaseModel):
    """GET /sources, GET /sources/{id} response."""

    id: uuid.UUID
    name: Optional[str] = None
    rss_url: str
    site_url: Optional[str] = None
    category: Optional[str] = None
    is_active: bool
    created_at: datetime


class SourceListResponse(AppBaseModel):
    """GET /sources paginated response."""

    items: list[SourceResponse]
    total: int
    page: int
    per_page: int
