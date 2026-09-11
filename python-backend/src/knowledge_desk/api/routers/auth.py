"""Authentication endpoints.

``POST /register`` and ``POST /login`` are exercised by the Electron main
process for first-run provisioning. ``/login`` must answer a failed credential
with a message containing "Invalid email or password" so the client's
auto-register fallback fires.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from knowledge_desk.api.deps import get_current_user, get_session, get_settings
from knowledge_desk.api.schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    SettingsProfileResponse,
    TokenResponse,
    UserProfileResponse,
)
from knowledge_desk.application import auth_service, settings_service
from knowledge_desk.config import Settings
from knowledge_desk.domain.models import User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=UserProfileResponse, summary="注册本机账户")
def register(
    payload: RegisterRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> UserProfileResponse:
    user, tokens = auth_service.register(
        session,
        settings,
        email=payload.email,
        password=payload.password,
        display_name=payload.display_name,
    )
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
    )


@router.post("/login", response_model=TokenResponse, summary="登录并签发令牌")
def login(
    payload: LoginRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    _user, tokens = auth_service.login(
        session, settings, email=payload.email, password=payload.password
    )
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in=tokens.expires_in,
    )


@router.post("/refresh", response_model=TokenResponse, summary="刷新访问令牌")
def refresh(
    payload: RefreshRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    _user, tokens = auth_service.refresh(session, settings, refresh_token=payload.refresh_token)
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in=tokens.expires_in,
    )


@router.post("/logout", summary="登出本机账户")
def logout() -> dict:
    # Tokens are stateless; the client simply drops them.
    return {"message": "ok"}


@router.get("/me", response_model=SettingsProfileResponse, summary="获取当前用户")
def me(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SettingsProfileResponse:
    return SettingsProfileResponse(**settings_service.get_profile(session, user))
