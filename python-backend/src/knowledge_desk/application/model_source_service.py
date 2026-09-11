"""Model source lifecycle: credentials, defaults and connectivity checks."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from knowledge_desk.domain.enums import ModelCheckStatus, ProviderType
from knowledge_desk.domain.models import ModelSource, UserPreference, now_utc
from knowledge_desk.errors import (
    BadRequestError,
    ConflictError,
    ModelUnavailableError,
    NotFoundError,
)
from knowledge_desk.infrastructure.crypto import SecretCipher
from knowledge_desk.infrastructure.llm import ChatClient
from knowledge_desk.infrastructure.redaction import redact_max

MAX_NAME_LENGTH = 120
MAX_BASE_URL_LENGTH = 510
MAX_MODEL_LENGTH = 160

PURPOSE_SUMMARY = "summary"
PURPOSE_TAGGING = "tagging"
PURPOSE_DEFAULT = "default"


@dataclass(frozen=True)
class TestOutcome:
    id: str
    status: str
    message: str
    checked_at: datetime


def parse_provider_type(value: str | None) -> ProviderType:
    try:
        return ProviderType((value or "").strip().lower())
    except ValueError as exc:
        raise BadRequestError("providerType 不合法") from exc


def get_source(session: Session, user_id: str, source_id: str) -> ModelSource:
    source = session.execute(
        select(ModelSource).where(ModelSource.id == source_id, ModelSource.user_id == user_id)
    ).scalar_one_or_none()
    if source is None:
        raise NotFoundError("模型源不存在")
    return source


def list_sources(session: Session, user_id: str) -> list[ModelSource]:
    return list(
        session.execute(
            select(ModelSource)
            .where(ModelSource.user_id == user_id)
            .order_by(ModelSource.is_default.desc(), ModelSource.created_at.asc())
        )
        .scalars()
        .all()
    )


def _assert_unique_name(
    session: Session, user_id: str, name: str, *, exclude_id: str | None = None
) -> None:
    stmt = select(ModelSource).where(
        ModelSource.user_id == user_id, func.lower(ModelSource.name) == name.lower()
    )
    if exclude_id is not None:
        stmt = stmt.where(ModelSource.id != exclude_id)
    if session.execute(stmt).scalars().first() is not None:
        raise ConflictError("模型源名称已存在")


def _apply_default(session: Session, user_id: str, source: ModelSource) -> None:
    others = (
        session.execute(
            select(ModelSource).where(
                ModelSource.user_id == user_id, ModelSource.id != source.id, ModelSource.is_default
            )
        )
        .scalars()
        .all()
    )
    for other in others:
        other.is_default = False
        session.add(other)
    source.is_default = True


def create_source(
    session: Session,
    cipher: SecretCipher,
    user_id: str,
    *,
    provider_type: str | None,
    name: str | None,
    base_url: str | None,
    api_key: str | None,
    default_model: str | None,
    enabled: bool | None = None,
    is_default: bool | None = None,
) -> ModelSource:
    resolved_type = parse_provider_type(provider_type)
    cleaned_name = (name or "").strip()
    if not cleaned_name or len(cleaned_name) > MAX_NAME_LENGTH:
        raise BadRequestError("模型源名称不合法")
    cleaned_url = (base_url or "").strip()
    if not cleaned_url or len(cleaned_url) > MAX_BASE_URL_LENGTH:
        raise BadRequestError("baseUrl 不合法")
    cleaned_model = (default_model or "").strip()
    if not cleaned_model or len(cleaned_model) > MAX_MODEL_LENGTH:
        raise BadRequestError("defaultModel 不合法")

    _assert_unique_name(session, user_id, cleaned_name)

    source = ModelSource(
        user_id=user_id,
        provider_type=resolved_type,
        name=cleaned_name,
        base_url=cleaned_url,
        default_model=cleaned_model,
        enabled=True if enabled is None else bool(enabled),
        is_default=bool(is_default),
    )

    secret = (api_key or "").strip()
    if secret:
        source.api_key_encrypted = cipher.encrypt(secret)
        source.api_key_masked = SecretCipher.mask(secret)

    session.add(source)
    session.flush()
    if source.is_default:
        _apply_default(session, user_id, source)
    session.commit()
    return source


def update_source(
    session: Session,
    cipher: SecretCipher,
    user_id: str,
    source_id: str,
    *,
    provider_type: str | None = None,
    name: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    default_model: str | None = None,
    enabled: bool | None = None,
    is_default: bool | None = None,
) -> ModelSource:
    source = get_source(session, user_id, source_id)

    if provider_type is not None:
        source.provider_type = parse_provider_type(provider_type)
    if name is not None:
        cleaned = name.strip()
        if not cleaned or len(cleaned) > MAX_NAME_LENGTH:
            raise BadRequestError("模型源名称不合法")
        _assert_unique_name(session, user_id, cleaned, exclude_id=source.id)
        source.name = cleaned
    if base_url is not None:
        cleaned_url = base_url.strip()
        if not cleaned_url or len(cleaned_url) > MAX_BASE_URL_LENGTH:
            raise BadRequestError("baseUrl 不合法")
        source.base_url = cleaned_url
    if default_model is not None:
        cleaned_model = default_model.strip()
        if not cleaned_model or len(cleaned_model) > MAX_MODEL_LENGTH:
            raise BadRequestError("defaultModel 不合法")
        source.default_model = cleaned_model
    if enabled is not None:
        source.enabled = bool(enabled)
    if is_default is not None:
        source.is_default = bool(is_default)
        if source.is_default:
            _apply_default(session, user_id, source)

    # An omitted or blank apiKey keeps the stored credential untouched.
    secret = (api_key or "").strip()
    if secret:
        source.api_key_encrypted = cipher.encrypt(secret)
        source.api_key_masked = SecretCipher.mask(secret)

    source.updated_at = now_utc()
    session.add(source)
    session.commit()
    return source


def delete_source(session: Session, user_id: str, source_id: str) -> None:
    source = get_source(session, user_id, source_id)
    preferences = session.get(UserPreference, user_id)
    if preferences is not None:
        for field in (
            "default_model_source_id",
            "summary_model_source_id",
            "tagging_model_source_id",
        ):
            if getattr(preferences, field) == source.id:
                setattr(preferences, field, None)
        session.add(preferences)
    session.delete(source)
    session.commit()


def set_enabled(session: Session, user_id: str, source_id: str, *, enabled: bool) -> ModelSource:
    source = get_source(session, user_id, source_id)
    source.enabled = enabled
    source.updated_at = now_utc()
    session.add(source)
    session.commit()
    return source


def set_default(session: Session, user_id: str, source_id: str) -> ModelSource:
    source = get_source(session, user_id, source_id)
    _apply_default(session, user_id, source)
    source.updated_at = now_utc()
    session.add(source)
    session.commit()
    return source


def build_client(cipher: SecretCipher, source: ModelSource, *, timeout_seconds: float) -> ChatClient:
    api_key = cipher.decrypt(source.api_key_encrypted)
    if not api_key:
        raise ModelUnavailableError("模型源凭据缺失或无法解密，请重新填写 API Key")
    return ChatClient(
        base_url=source.base_url,
        api_key=api_key,
        model=source.default_model,
        timeout_seconds=timeout_seconds,
    )


def test_connection(
    session: Session, cipher: SecretCipher, user_id: str, source_id: str, *, timeout_seconds: float
) -> TestOutcome:
    source = get_source(session, user_id, source_id)
    status = ModelCheckStatus.OK
    message = "连接成功"
    try:
        client = build_client(cipher, source, timeout_seconds=timeout_seconds)
        client.verify_connectivity()
    except ModelUnavailableError as exc:
        status = ModelCheckStatus.ERROR
        message = str(exc)
    except Exception:  # noqa: BLE001 - never leak provider internals
        status = ModelCheckStatus.ERROR
        message = "模型源连通性测试失败"

    source.last_check_status = status
    source.last_check_message = redact_max(message, 255)
    source.last_checked_at = now_utc()
    source.updated_at = now_utc()
    session.add(source)
    session.commit()

    return TestOutcome(
        id=source.id,
        status=status.value,
        message=message,
        checked_at=source.last_checked_at,
    )


def resolve_source(
    session: Session, user_id: str, *, purpose: str = PURPOSE_DEFAULT
) -> ModelSource | None:
    """Resolve the model source to use for a given purpose.

    Falls back purpose-specific preference -> explicit default -> first enabled
    source. Returns ``None`` when nothing usable is configured, which is a
    first-class state: the base feature set must keep working without a model.
    """

    preferences = session.get(UserPreference, user_id)
    candidates: list[str | None] = []
    if preferences is not None:
        if purpose == PURPOSE_SUMMARY:
            candidates.append(preferences.summary_model_source_id)
        elif purpose == PURPOSE_TAGGING:
            candidates.append(preferences.tagging_model_source_id)
        candidates.append(preferences.default_model_source_id)

    for source_id in candidates:
        if not source_id:
            continue
        source = session.execute(
            select(ModelSource).where(ModelSource.id == source_id, ModelSource.user_id == user_id)
        ).scalar_one_or_none()
        if source is not None and source.enabled:
            return source

    return session.execute(
        select(ModelSource)
        .where(ModelSource.user_id == user_id, ModelSource.enabled.is_(True))
        .order_by(ModelSource.is_default.desc(), ModelSource.created_at.asc())
    ).scalars().first()
