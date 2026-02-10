import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    source_url: Mapped[str] = mapped_column(Text, unique=True)
    source_name: Mapped[Optional[str]] = mapped_column(String(100))
    title_original: Mapped[Optional[str]] = mapped_column(Text)
    title_ja: Mapped[Optional[str]] = mapped_column(Text)
    body_original: Mapped[Optional[str]] = mapped_column(Text)
    body_translated: Mapped[Optional[str]] = mapped_column(Text)
    summary_ja: Mapped[Optional[str]] = mapped_column(Text)
    author: Mapped[Optional[str]] = mapped_column(String(200))
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    og_image_url: Mapped[Optional[str]] = mapped_column(Text)
    categories: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("ix_articles_published_at", "published_at"),
    )
