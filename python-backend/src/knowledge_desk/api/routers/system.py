"""System health and readiness endpoints.

These are intentionally unauthenticated: the Electron ``BackendManager`` polls
``/api/v1/system/health/ready`` with a bare HTTP GET and no token.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from knowledge_desk import __version__
from knowledge_desk.api.deps import get_session, get_settings
from knowledge_desk.api.schemas import ReadinessComponent, ReadinessResponse
from knowledge_desk.config import Settings
from knowledge_desk.errors import AppError

router = APIRouter(prefix="/api/v1/system", tags=["system"])


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "SERVICE_UNAVAILABLE"
    message = "服务尚未就绪"


@router.get("/health/live", summary="进程存活探针")
def live() -> dict:
    return {"status": "ok"}


@router.get("/health/ready", response_model=ReadinessResponse, summary="就绪探针")
def ready(
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> ReadinessResponse:
    database_status = "ok"
    detail: str | None = None
    try:
        session.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - readiness must never raise raw driver errors
        database_status = "error"
        detail = "本机数据库不可访问"

    components = [
        ReadinessComponent(name="database", status=database_status, detail=detail),
        ReadinessComponent(
            name="desktop-runtime",
            status="ok" if settings.desktop_mode else "degraded",
            detail=None if settings.desktop_mode else "以本机开发模式运行",
        ),
    ]

    if database_status != "ok":
        raise ServiceUnavailableError("本机数据库不可访问")

    return ReadinessResponse(
        status="ready",
        version=__version__,
        desktop_mode=settings.desktop_mode,
        database=database_status,
        components=components,
    )
