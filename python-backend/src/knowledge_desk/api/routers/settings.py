"""Settings, profile and JSON backup endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from knowledge_desk.api import serializers
from knowledge_desk.api.deps import get_current_user, get_session
from knowledge_desk.api.schemas import (
    SettingsBackupPayload,
    SettingsImportResponse,
    SettingsProfileResponse,
    SettingsStorageResponse,
    UpdateSettingsProfileRequest,
)
from knowledge_desk.application import knowledge_service, settings_service
from knowledge_desk.domain.models import User

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("/profile", response_model=SettingsProfileResponse, summary="获取个人资料与模型偏好")
def get_profile(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SettingsProfileResponse:
    return SettingsProfileResponse(**settings_service.get_profile(session, user))


@router.put("/profile", response_model=SettingsProfileResponse, summary="更新个人资料与模型偏好")
def update_profile(
    payload: UpdateSettingsProfileRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SettingsProfileResponse:
    draft = payload.model_dump(exclude_unset=True, by_alias=True)
    return SettingsProfileResponse(**settings_service.update_profile(session, user, draft))


@router.get("/storage", response_model=SettingsStorageResponse, summary="获取存储概览")
def get_storage(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SettingsStorageResponse:
    return serializers.storage_payload(knowledge_service.storage_summary(session, user.id))


@router.get("/export", response_model=SettingsBackupPayload, summary="导出本机知识库备份")
def export_backup(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SettingsBackupPayload:
    payload = settings_service.export_backup(session, user)
    return SettingsBackupPayload(**payload)


@router.post("/import", response_model=SettingsImportResponse, summary="合并导入本机知识库备份")
def import_backup(
    payload: SettingsBackupPayload,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SettingsImportResponse:
    result = settings_service.import_backup(session, user, payload.model_dump(by_alias=True))
    return SettingsImportResponse(**result)
