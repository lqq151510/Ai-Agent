"""SQLAlchemy 2.0 declarative models for the local SQLite MVP database.

Design notes
------------
* Primary keys are canonical lowercase UUID4 strings: the desktop main process
  validates knowledge item ids with a 36 character UUID pattern before allowing
  a review request through, so ids must stay RFC 4122 shaped.
* All timestamps are stored as naive UTC and re-hydrated as timezone-aware UTC,
  which keeps the ISO-8601 payloads the renderer expects unambiguous.
* Original document paths are stored relative to the managed data directory.
  Absolute host paths must never be persisted or returned.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from knowledge_desk.domain.enums import (
    IngestionJobStatus,
    IngestionJobType,
    KnowledgeStatus,
    ModelCheckStatus,
    OrganizeMode,
    PrivacyMode,
    ProviderType,
    ReviewRating,
    SourceAssetOrigin,
    SourceType,
)

UUID_LENGTH = 36
SHORT_LENGTH = 64


def new_uuid() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Store naive UTC, hand back timezone-aware UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def enum_column(enum_cls: type[PyEnum], *, length: int = 32):
    from sqlalchemy import Enum as SAEnum

    return SAEnum(
        enum_cls,
        native_enum=False,
        length=length,
        values_callable=lambda cls: [member.value for member in cls],
        validate_strings=True,
    )


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=now_utc, onupdate=now_utc, nullable=False
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(UUID_LENGTH), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120))
    avatar_url: Mapped[str | None] = mapped_column(String(510))

    preferences: Mapped["UserPreference | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )


class UserPreference(Base, TimestampMixin):
    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    organize_mode: Mapped[OrganizeMode] = mapped_column(
        enum_column(OrganizeMode), default=OrganizeMode.MANUAL, nullable=False
    )
    privacy_mode: Mapped[PrivacyMode] = mapped_column(
        enum_column(PrivacyMode), default=PrivacyMode.LOCAL_FIRST, nullable=False
    )
    default_model_source_id: Mapped[str | None] = mapped_column(String(UUID_LENGTH))
    summary_model_source_id: Mapped[str | None] = mapped_column(String(UUID_LENGTH))
    tagging_model_source_id: Mapped[str | None] = mapped_column(String(UUID_LENGTH))

    user: Mapped[User] = relationship(back_populates="preferences")


class KnowledgeItem(Base, TimestampMixin):
    __tablename__ = "knowledge_items"

    id: Mapped[str] = mapped_column(String(UUID_LENGTH), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_type: Mapped[SourceType] = mapped_column(enum_column(SourceType), nullable=False)
    title: Mapped[str] = mapped_column(String(510), nullable=False)
    source_uri: Mapped[str | None] = mapped_column(String(2048))
    raw_content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    cleaned_content: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    status: Mapped[KnowledgeStatus] = mapped_column(
        enum_column(KnowledgeStatus), nullable=False, default=KnowledgeStatus.INBOX
    )
    language: Mapped[str | None] = mapped_column(String(16))
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content_hash: Mapped[str | None] = mapped_column(String(SHORT_LENGTH))
    archived_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    tags: Mapped[list["Tag"]] = relationship(
        secondary="knowledge_item_tags", back_populates="items", lazy="selectin"
    )
    source_asset: Mapped["SourceAsset | None"] = relationship(
        back_populates="item", cascade="all, delete-orphan", uselist=False, lazy="selectin"
    )

    __table_args__ = (
        Index("ix_knowledge_items_user_status_updated", "user_id", "status", "updated_at"),
        Index("ix_knowledge_items_user_content_hash", "user_id", "content_hash"),
    )


class Tag(Base, TimestampMixin):
    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(String(UUID_LENGTH), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str | None] = mapped_column(String(32))

    items: Mapped[list[KnowledgeItem]] = relationship(
        secondary="knowledge_item_tags", back_populates="tags"
    )

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_tags_user_name"),)


class KnowledgeItemTag(Base):
    __tablename__ = "knowledge_item_tags"

    knowledge_item_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )


class ModelSource(Base, TimestampMixin):
    __tablename__ = "model_sources"

    id: Mapped[str] = mapped_column(String(UUID_LENGTH), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider_type: Mapped[ProviderType] = mapped_column(enum_column(ProviderType), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    base_url: Mapped[str] = mapped_column(String(510), nullable=False)
    default_model: Mapped[str] = mapped_column(String(160), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    api_key_encrypted: Mapped[str | None] = mapped_column(Text)
    api_key_masked: Mapped[str | None] = mapped_column(String(SHORT_LENGTH))

    last_check_status: Mapped[ModelCheckStatus | None] = mapped_column(
        enum_column(ModelCheckStatus)
    )
    last_check_message: Mapped[str | None] = mapped_column(String(255))
    last_checked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_model_sources_user_name"),
    )


class IngestionJob(Base, TimestampMixin):
    __tablename__ = "ingestion_jobs"

    id: Mapped[str] = mapped_column(String(UUID_LENGTH), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    knowledge_item_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_type: Mapped[IngestionJobType] = mapped_column(enum_column(IngestionJobType), nullable=False)
    status: Mapped[IngestionJobStatus] = mapped_column(
        enum_column(IngestionJobStatus), nullable=False, default=IngestionJobStatus.PENDING
    )
    error_message: Mapped[str | None] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(String(120))
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    __table_args__ = (
        Index("ix_ingestion_jobs_user_item_created", "user_id", "knowledge_item_id", "created_at"),
    )


class ReviewState(Base, TimestampMixin):
    __tablename__ = "review_states"

    id: Mapped[str] = mapped_column(String(UUID_LENGTH), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    knowledge_item_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    due_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ease_factor: Mapped[float] = mapped_column(Float, nullable=False, default=2.5)
    repetitions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_rating: Mapped[ReviewRating | None] = mapped_column(enum_column(ReviewRating))
    last_reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    __table_args__ = (
        UniqueConstraint(
            "user_id", "knowledge_item_id", name="uq_review_states_user_item"
        ),
        Index("ix_review_states_user_due", "user_id", "due_at"),
    )


class SourceAsset(Base, TimestampMixin):
    __tablename__ = "source_assets"

    id: Mapped[str] = mapped_column(String(UUID_LENGTH), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    knowledge_item_id: Mapped[str] = mapped_column(
        String(UUID_LENGTH),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    original_filename: Mapped[str] = mapped_column(String(510), nullable=False)
    # Relative to the managed sources directory. Never an absolute host path.
    stored_relative_path: Mapped[str] = mapped_column(String(510), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(160))
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content_hash: Mapped[str | None] = mapped_column(String(SHORT_LENGTH))
    origin: Mapped[SourceAssetOrigin] = mapped_column(
        enum_column(SourceAssetOrigin), nullable=False, default=SourceAssetOrigin.PICKER
    )

    item: Mapped[KnowledgeItem] = relationship(back_populates="source_asset")
