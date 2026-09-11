"""FastAPI application factory and process entry point."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, sessionmaker
from starlette.exceptions import HTTPException as StarletteHTTPException

from knowledge_desk import __version__
from knowledge_desk.api.routers import auth as auth_router
from knowledge_desk.api.routers import knowledge_items as knowledge_items_router
from knowledge_desk.api.routers import model_sources as model_sources_router
from knowledge_desk.api.routers import reviews as reviews_router
from knowledge_desk.api.routers import settings as settings_router
from knowledge_desk.api.routers import system as system_router
from knowledge_desk.config import Settings
from knowledge_desk.errors import AppError, NotFoundError, ValidationFailedError
from knowledge_desk.infrastructure.crypto import SecretCipher
from knowledge_desk.infrastructure.database import (
    build_engine,
    build_session_factory,
    run_migrations,
)
from knowledge_desk.infrastructure.redaction import redact

LOGGER = logging.getLogger("knowledge_desk")

# Only local desktop surfaces may talk to the server: the packaged renderer
# (app://), the Vite dev server and the explicit direct-preview mode.
ALLOWED_ORIGIN_REGEX = r"^(app://.*|file://.*|https?://(localhost|127\.0\.0\.1)(:\d+)?)$"


class RedactingFilter(logging.Filter):
    """Mask credentials and home paths in every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # pragma: no cover - defensive
            return True
        redacted = redact(message)
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return True


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.addFilter(RedactingFilter())
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s", "%Y-%m-%dT%H:%M:%S%z")
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, level.upper(), logging.INFO))


def _error_response(exc: AppError) -> JSONResponse:
    payload = exc.to_payload()
    if exc.status_code >= 500:
        LOGGER.error("request failed: %s (%s)", payload.get("message"), payload.get("code"))
    else:
        LOGGER.info("request rejected: %s (%s)", payload.get("message"), payload.get("code"))
    return JSONResponse(status_code=exc.status_code, content=payload)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_request: Request, exc: AppError) -> JSONResponse:
        return _error_response(exc)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = []
        for error in exc.errors():
            location = ".".join(str(part) for part in error.get("loc", ()) if part != "body")
            details.append({"field": location or "body", "message": error.get("msg", "invalid")})
        first = details[0] if details else {"field": "body", "message": "invalid"}
        failure = ValidationFailedError(
            f"参数校验失败：{first['field']} {first['message']}",
            details=details,
        )
        return _error_response(failure)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return _error_response(NotFoundError("未知接口路径"))
        return JSONResponse(
            status_code=exc.status_code,
            content={"message": str(exc.detail), "code": f"HTTP_{exc.status_code}"},
        )

    @app.exception_handler(Exception)
    async def _unhandled(_request: Request, exc: Exception) -> JSONResponse:
        # Never echo internals to the client; the redacted log keeps a trail.
        LOGGER.exception("unhandled error: %s", redact(str(exc)))
        return JSONResponse(
            status_code=500,
            content={"message": "Internal server error", "code": "INTERNAL_ERROR"},
        )


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or Settings()
    resolved.ensure_directories()
    configure_logging(resolved.log_level)

    # Repeatable initial migration; a no-op once the head revision is applied.
    run_migrations(resolved)

    engine = build_engine(resolved)
    session_factory: sessionmaker[Session] = build_session_factory(engine)
    cipher = SecretCipher(resolved.resolved_encryption_key())

    docs_enabled = not resolved.desktop_mode

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        LOGGER.info(
            "knowledge desk backend ready (version=%s, desktop=%s)",
            __version__,
            resolved.desktop_mode,
        )
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(
        title="Knowledge Desk Local Backend",
        version=__version__,
        docs_url="/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
        lifespan=lifespan,
    )

    app.state.settings = resolved
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.cipher = cipher

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=ALLOWED_ORIGIN_REGEX,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    register_error_handlers(app)

    app.include_router(system_router.router)
    app.include_router(auth_router.router)
    app.include_router(knowledge_items_router.router)
    app.include_router(model_sources_router.router)
    app.include_router(settings_router.router)
    app.include_router(reviews_router.router)

    return app


def main() -> None:
    import uvicorn

    settings = Settings()
    app = create_app(settings)
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_config=None,
        access_log=False,
    )


if __name__ == "__main__":  # pragma: no cover - process entry point
    main()
