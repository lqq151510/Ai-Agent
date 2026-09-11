"""Request-scoped dependencies: settings, session, cipher and authentication."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from knowledge_desk.application import auth_service
from knowledge_desk.config import Settings
from knowledge_desk.domain.models import User
from knowledge_desk.errors import UnauthorizedError
from knowledge_desk.infrastructure.crypto import SecretCipher
from knowledge_desk.infrastructure.security import ACCESS_TOKEN_TYPE, decode_token


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_cipher(request: Request) -> SecretCipher:
    return request.app.state.cipher


def get_session(request: Request) -> Iterator[Session]:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


def get_current_user(
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        raise UnauthorizedError("缺少访问令牌")
    token = header[7:].strip()
    if not token:
        raise UnauthorizedError("缺少访问令牌")

    payload = decode_token(
        token, settings.resolved_jwt_secret(), expected_type=ACCESS_TOKEN_TYPE
    )
    user = auth_service.find_user_by_id(session, str(payload["sub"]))
    if user is None:
        raise UnauthorizedError("访问令牌对应的用户不存在")
    return user
