from typing import Optional

from pydantic import HttpUrl

from app.schemas import AppBaseModel


class IngestRequest(AppBaseModel):
    """POST /ingest request body."""

    url: HttpUrl


class IngestResponse(AppBaseModel):
    """POST /ingest response (extraction result).

    published_at is returned as the raw date string from trafilatura (e.g. "2026-01-01").
    Conversion to datetime is the caller's (n8n) responsibility.
    """

    title: Optional[str] = None
    body: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[str] = None
    og_image_url: Optional[str] = None
