"""Authentication, first-run provisioning and per-user preferences."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from knowledge_desk.config import Settings
from knowledge_desk.domain.enums import OrganizeMode, PrivacyMode
from knowledge_desk.domain.models import User, UserPreference
from knowledge_desk.errors import BadRequestError, ConflictError, InvalidCredentialsError
from knowledge_desk.infrastructure.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)

MIN_PASSWORD_LENGTH = 8
MAX_EMAIL_LENGTH = 255
DEFAULT_DISPLAY_NAME = "泽宝"


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int


def normalize_email(email: str) -> str:
    normalized = (email or "").strip().lower()
    if not normalized or "@" not in normalized or len(normalized) > MAX_EMAIL_LENGTH:
        raise BadRequestError("邮箱格式不合法")
    return normalized


def validate_password(password: str) -> str:
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        raise BadRequestError(f"密码至少需要 {MIN_PASSWORD_LENGTH} 位字符")
    if len(password) > 200:
        raise BadRequestError("密码长度超出上限")
    return password


def find_user_by_email(session: Session, email: str) -> User | None:
    return session.execute(select(User).where(User.email == normalize_email(email))).scalar_one_or_none()


def find_user_by_id(session: Session, user_id: str) -> User | None:
    return session.get(User, user_id)


def ensure_preferences(session: Session, user_id: str) -> UserPreference:
    preferences = session.get(UserPreference, user_id)
    if preferences is None:
        preferences = UserPreference(
            user_id=user_id,
            organize_mode=OrganizeMode.MANUAL,
            privacy_mode=PrivacyMode.LOCAL_FIRST,
        )
        session.add(preferences)
        session.flush()
    return preferences


def _issue_tokens(user_id: str, settings: Settings, *, now: datetime | None = None) -> TokenPair:
    secret = settings.resolved_jwt_secret()
    return TokenPair(
        access_token=create_access_token(
            user_id, secret, settings.access_token_ttl_minutes, now=now
        ),
        refresh_token=create_refresh_token(user_id, secret, settings.refresh_token_ttl_days, now=now),
        expires_in=settings.access_token_ttl_minutes * 60,
    )


def register(
    session: Session,
    settings: Settings,
    *,
    email: str,
    password: str,
    display_name: str | None = None,
) -> tuple[User, TokenPair]:
    normalized = normalize_email(email)
    validate_password(password)
    if find_user_by_email(session, normalized) is not None:
        # Wording matters: the desktop main process matches "already" to decide
        # that a first-run register collision is benign and retries the login.
        raise ConflictError("Email already registered")

    user = User(
        email=normalized,
        password_hash=hash_password(password),
        display_name=(display_name or "").strip() or None,
    )
    session.add(user)
    session.flush()
    ensure_preferences(session, user.id)
    session.commit()
    return user, _issue_tokens(user.id, settings)


def login(session: Session, settings: Settings, *, email: str, password: str) -> tuple[User, TokenPair]:
    normalized = normalize_email(email)
    user = find_user_by_email(session, normalized)
    if user is None or not verify_password(password, user.password_hash):
        raise InvalidCredentialsError()
    return user, _issue_tokens(user.id, settings)


def refresh(session: Session, settings: Settings, *, refresh_token: str) -> tuple[User, TokenPair]:
    from knowledge_desk.infrastructure.security import REFRESH_TOKEN_TYPE, decode_token

    payload = decode_token(
        refresh_token, settings.resolved_jwt_secret(), expected_type=REFRESH_TOKEN_TYPE
    )
    user = find_user_by_id(session, str(payload["sub"]))
    if user is None:
        raise InvalidCredentialsError()
    return user, _issue_tokens(user.id, settings)


def touch_login(session: Session, user: User) -> None:
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
