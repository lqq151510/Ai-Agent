"""Model source management endpoints.

Responses never contain the stored credential: only the masked preview that was
computed at write time.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from knowledge_desk.api import serializers
from knowledge_desk.api.deps import get_cipher, get_current_user, get_session, get_settings
from knowledge_desk.api.schemas import (
    CreateModelSourceRequest,
    ModelSourceResponse,
    ModelSourceTestResponse,
    UpdateModelSourceRequest,
)
from knowledge_desk.application import model_source_service
from knowledge_desk.config import Settings
from knowledge_desk.domain.models import User
from knowledge_desk.infrastructure.crypto import SecretCipher

router = APIRouter(prefix="/api/v1/model-sources", tags=["model-sources"])


@router.get("", response_model=list[ModelSourceResponse], summary="获取模型源列表")
def list_model_sources(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[ModelSourceResponse]:
    return [
        serializers.model_source_payload(source)
        for source in model_source_service.list_sources(session, user.id)
    ]


@router.post("", response_model=ModelSourceResponse, summary="创建模型源")
def create_model_source(
    payload: CreateModelSourceRequest,
    session: Session = Depends(get_session),
    cipher: SecretCipher = Depends(get_cipher),
    user: User = Depends(get_current_user),
) -> ModelSourceResponse:
    source = model_source_service.create_source(
        session,
        cipher,
        user.id,
        provider_type=payload.provider_type,
        name=payload.name,
        base_url=payload.base_url,
        api_key=payload.api_key,
        default_model=payload.default_model,
        enabled=payload.enabled,
        is_default=payload.is_default,
    )
    return serializers.model_source_payload(source)


@router.put("/{source_id}", response_model=ModelSourceResponse, summary="更新模型源")
def update_model_source(
    source_id: str,
    payload: UpdateModelSourceRequest,
    session: Session = Depends(get_session),
    cipher: SecretCipher = Depends(get_cipher),
    user: User = Depends(get_current_user),
) -> ModelSourceResponse:
    source = model_source_service.update_source(
        session,
        cipher,
        user.id,
        source_id,
        provider_type=payload.provider_type,
        name=payload.name,
        base_url=payload.base_url,
        api_key=payload.api_key,
        default_model=payload.default_model,
        enabled=payload.enabled,
        is_default=payload.is_default,
    )
    return serializers.model_source_payload(source)


@router.delete("/{source_id}", status_code=204, summary="删除模型源")
def delete_model_source(
    source_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    model_source_service.delete_source(session, user.id, source_id)


@router.post("/{source_id}/enable", response_model=ModelSourceResponse, summary="启用模型源")
def enable_model_source(
    source_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ModelSourceResponse:
    source = model_source_service.set_enabled(session, user.id, source_id, enabled=True)
    return serializers.model_source_payload(source)


@router.post("/{source_id}/disable", response_model=ModelSourceResponse, summary="停用模型源")
def disable_model_source(
    source_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ModelSourceResponse:
    source = model_source_service.set_enabled(session, user.id, source_id, enabled=False)
    return serializers.model_source_payload(source)


@router.post("/{source_id}/set-default", response_model=ModelSourceResponse, summary="设为默认模型源")
def set_default_model_source(
    source_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ModelSourceResponse:
    source = model_source_service.set_default(session, user.id, source_id)
    return serializers.model_source_payload(source)


@router.post("/{source_id}/test", response_model=ModelSourceTestResponse, summary="测试模型源连通性")
def test_model_source(
    source_id: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    cipher: SecretCipher = Depends(get_cipher),
    user: User = Depends(get_current_user),
) -> ModelSourceTestResponse:
    outcome = model_source_service.test_connection(
        session, cipher, user.id, source_id, timeout_seconds=settings.llm_timeout_seconds
    )
    return ModelSourceTestResponse(
        id=outcome.id,
        status=outcome.status,
        message=outcome.message,
        checked_at=outcome.checked_at,
    )
