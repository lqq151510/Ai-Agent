"""Pydantic v2 request/response contracts.

Field names stay snake_case in Python and serialise to the camelCase wire
format the existing desktop client already speaks.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class WireModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="ignore",
    )


# --------------------------------------------------------------------------- #
# System
# --------------------------------------------------------------------------- #


class ReadinessComponent(WireModel):
    name: str
    status: str
    detail: str | None = None


class ReadinessResponse(WireModel):
    status: str
    version: str
    desktop_mode: bool
    database: str
    components: list[ReadinessComponent] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #


class RegisterRequest(WireModel):
    email: str
    password: str
    display_name: str | None = None


class LoginRequest(WireModel):
    email: str
    password: str


class RefreshRequest(WireModel):
    refresh_token: str


class LogoutRequest(WireModel):
    refresh_token: str | None = None


class TokenResponse(WireModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "Bearer"


class UserProfileResponse(WireModel):
    id: str
    email: str
    display_name: str | None = None
    avatar_url: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None


# --------------------------------------------------------------------------- #
# Tags
# --------------------------------------------------------------------------- #


class TagResponse(WireModel):
    id: str | None = None
    name: str
    color: str | None = None
    count: int | None = None


class CreateTagRequest(WireModel):
    name: str
    color: str | None = None


# --------------------------------------------------------------------------- #
# Knowledge items
# --------------------------------------------------------------------------- #


class SourceAssetResponse(WireModel):
    id: str
    original_filename: str
    media_type: str
    byte_size: int
    origin: str
    availability: str


class KnowledgeItemResponse(WireModel):
    id: str
    source_type: str
    title: str
    source_uri: str | None = None
    raw_content: str | None = None
    cleaned_content: str | None = None
    summary: str | None = None
    status: str
    language: str | None = None
    word_count: int = 0
    tags: list[TagResponse] = Field(default_factory=list)
    source_asset: SourceAssetResponse | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    archived_at: datetime | None = None


class KnowledgeItemPageResponse(WireModel):
    items: list[KnowledgeItemResponse]
    total: int
    page: int
    page_size: int


class UpdateKnowledgeItemRequest(WireModel):
    title: str | None = None
    summary: str | None = None
    tags: list[str] | None = None


class ImportWebRequest(WireModel):
    title: str | None = None
    url: str
    content: str


class ImportSnippetRequest(WireModel):
    title: str | None = None
    content: str


class ImportFileRequest(WireModel):
    title: str | None = None
    source_type: str | None = None
    source_uri: str | None = None
    content: str


class ImportPreflightRequest(WireModel):
    content_hashes: list[str] = Field(default_factory=list)


class ImportPreflightResponse(WireModel):
    existing_hashes: list[str]
    known_count: int


class BatchOrganizeResponse(WireModel):
    total: int
    succeeded: int
    failed: int
    total_count: int
    success_count: int
    failed_count: int


# --------------------------------------------------------------------------- #
# Ingestion jobs
# --------------------------------------------------------------------------- #


class IngestionJobResponse(WireModel):
    id: str
    knowledge_item_id: str
    job_type: str
    status: str
    error_message: str | None = None
    note: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime | None = None


# --------------------------------------------------------------------------- #
# Dashboard / storage
# --------------------------------------------------------------------------- #


class ReviewBadge(WireModel):
    due_count: int
    next_due_at: datetime | None = None


class DashboardSummaryResponse(WireModel):
    total_items: int
    inbox_items: int
    ready_items: int
    failed_items: int
    processing_items: int = 0
    archived_items: int = 0
    recent_items: list[KnowledgeItemResponse] = Field(default_factory=list)
    top_tags: list[TagResponse] = Field(default_factory=list)
    review: ReviewBadge | None = None


class SettingsStorageResponse(WireModel):
    total_items: int
    inbox_items: int
    ready_items: int
    failed_items: int
    processing_items: int = 0
    archived_items: int
    total_tags: int
    total_model_sources: int
    total_source_assets: int
    total_review_states: int


# --------------------------------------------------------------------------- #
# Model sources
# --------------------------------------------------------------------------- #


class ModelSourceResponse(WireModel):
    id: str
    provider_type: str
    name: str
    base_url: str
    default_model: str
    api_key_masked: str | None = None
    enabled: bool
    is_default: bool
    last_check_status: str | None = None
    last_check_message: str | None = None
    last_checked_at: datetime | None = None


class CreateModelSourceRequest(WireModel):
    provider_type: str
    name: str
    base_url: str
    api_key: str | None = None
    default_model: str
    enabled: bool | None = None
    is_default: bool | None = None


class UpdateModelSourceRequest(WireModel):
    provider_type: str | None = None
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    default_model: str | None = None
    enabled: bool | None = None
    is_default: bool | None = None


class ModelSourceTestResponse(WireModel):
    id: str
    status: str
    message: str
    checked_at: datetime | None = None


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #


class SettingsProfileResponse(WireModel):
    id: str | None = None
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    organize_mode: str | None = None
    privacy_mode: str | None = None
    default_model_source_id: str | None = None
    summary_model_source_id: str | None = None
    tagging_model_source_id: str | None = None


class UpdateSettingsProfileRequest(WireModel):
    display_name: str | None = None
    avatar_url: str | None = None
    organize_mode: str | None = None
    privacy_mode: str | None = None
    default_model_source_id: str | None = None
    summary_model_source_id: str | None = None
    tagging_model_source_id: str | None = None
    clear_default_model_source: bool | None = None
    clear_summary_model_source: bool | None = None
    clear_tagging_model_source: bool | None = None


class BackupPreferences(WireModel):
    display_name: str | None = None
    avatar_url: str | None = None
    organize_mode: str
    privacy_mode: str


class BackupTag(WireModel):
    id: str
    name: str
    color: str | None = None
    created_at: datetime


class BackupItem(WireModel):
    id: str
    source_type: str
    title: str
    source_uri: str | None = None
    raw_content: str = ""
    cleaned_content: str | None = None
    summary: str | None = None
    status: str
    language: str | None = None
    word_count: int = 0
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
    source_asset: SourceAssetResponse | None = None
    tag_ids: list[str] = Field(default_factory=list)


class BackupReviewState(WireModel):
    knowledge_item_id: str
    due_at: datetime
    interval_days: int
    ease_factor: float
    repetitions: int
    last_rating: str
    last_reviewed_at: datetime
    created_at: datetime
    updated_at: datetime


class SettingsBackupPayload(WireModel):
    schema_version: int
    exported_at: datetime | None = None
    preferences: BackupPreferences | None = None
    tags: list[BackupTag] = Field(default_factory=list)
    knowledge_items: list[BackupItem] = Field(default_factory=list)
    model_sources_included: bool = False
    review_states: list[BackupReviewState] = Field(default_factory=list)


class SettingsImportResponse(WireModel):
    imported_items: int
    created_tags: int
    restored_review_states: int = 0
    preferences_restored: bool = False
    model_sources_restored: bool = False
    message: str


# --------------------------------------------------------------------------- #
# Reviews
# --------------------------------------------------------------------------- #


class ReviewItemResponse(WireModel):
    id: str
    title: str
    source_type: str
    summary: str = ""
    tags: list[TagResponse] = Field(default_factory=list)
    updated_at: datetime | None = None
    due_at: datetime | None = None
    interval_days: int | None = None
    ease_factor: float | None = None
    repetitions: int | None = None


class ReviewQueueResponse(WireModel):
    items: list[ReviewItemResponse]
    due_count: int


class ReviewSummaryResponse(WireModel):
    due_count: int
    next_due_at: datetime | None = None


class ReviewCompleteRequest(WireModel):
    rating: Literal["again", "hard", "good", "easy"]


class ReviewStateResponse(WireModel):
    knowledge_item_id: str
    rating: str
    due_at: datetime
    interval_days: int
    ease_factor: float
    repetitions: int


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #


class ErrorResponse(WireModel):
    message: str
    code: str
    details: Any | None = None
