"""Application error taxonomy.

Every error surfaced to the desktop client serialises to the unified payload
``{"message": ..., "code": ...}`` because the Electron main process reads
``message`` (falling back to ``code``) to build the user-visible error string.

Error messages must never contain API keys, tokens, absolute host paths or
document content hashes.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    status_code = 500
    code = "INTERNAL_ERROR"
    message = "Internal server error"

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        details: Any = None,
    ) -> None:
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code
        self.details = details
        super().__init__(self.message)

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"message": self.message, "code": self.code}
        if self.details is not None:
            payload["details"] = self.details
        return payload


class BadRequestError(AppError):
    status_code = 400
    code = "BAD_REQUEST"
    message = "请求参数不合法"


class ValidationFailedError(BadRequestError):
    code = "VALIDATION_ERROR"
    message = "请求参数校验失败"


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"
    message = "Unauthorized"


class InvalidCredentialsError(UnauthorizedError):
    code = "INVALID_CREDENTIALS"
    # The Electron main process matches this wording to trigger the
    # first-run register fallback. Do not change it casually.
    message = "Invalid email or password"


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"
    message = "Forbidden"


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "资源不存在"


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"
    message = "资源冲突"


class DuplicateContentError(ConflictError):
    code = "DUPLICATE_CONTENT"
    # Matches the Java baseline wording so existing UI copy stays valid.
    message = "An identical file has already been imported"


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "PAYLOAD_TOO_LARGE"
    message = "文件超出允许的大小上限"


class UnsupportedMediaTypeError(AppError):
    status_code = 415
    code = "UNSUPPORTED_MEDIA_TYPE"
    message = "不支持的文件类型"


class ModelUnavailableError(AppError):
    status_code = 502
    code = "MODEL_UNAVAILABLE"
    message = "模型源暂时不可用"


class EncryptionUnavailableError(AppError):
    status_code = 503
    code = "ENCRYPTION_UNAVAILABLE"
    message = "本机加密密钥不可用，无法安全保存模型凭据"
