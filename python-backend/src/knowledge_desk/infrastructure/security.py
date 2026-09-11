"""Password hashing and JWT issuing/verification.

Deliberately dependency-light: ``hashlib.scrypt`` for password storage and
PyJWT for the HS256 tokens the desktop client already expects
(``Authorization: Bearer <accessToken>``).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from knowledge_desk.errors import UnauthorizedError

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32
SALT_BYTES = 16
SCRYPT_PREFIX = "scrypt"

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"

# Tolerate small clock adjustments without rejecting a freshly issued token.
DECODE_LEEWAY_SECONDS = 30


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return (
        f"{SCRYPT_PREFIX}${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}"
        f"${_b64encode(salt)}${_b64encode(digest)}"
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        prefix, n, r, p, salt_b64, digest_b64 = stored.split("$")
        if prefix != SCRYPT_PREFIX:
            return False
        salt = _b64decode(salt_b64)
        expected = _b64decode(digest_b64)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def _encode_token(
    user_id: str,
    secret: str,
    *,
    token_type: str,
    expires_delta: timedelta,
    now: datetime,
) -> str:
    issued_at = now.astimezone(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "typ": token_type,
        "iat": int(issued_at.timestamp()),
        "exp": int((issued_at + expires_delta).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def create_access_token(
    user_id: str,
    secret: str,
    ttl_minutes: int,
    *,
    now: datetime | None = None,
) -> str:
    return _encode_token(
        user_id,
        secret,
        token_type=ACCESS_TOKEN_TYPE,
        expires_delta=timedelta(minutes=max(1, ttl_minutes)),
        now=now or datetime.now(timezone.utc),
    )


def create_refresh_token(
    user_id: str,
    secret: str,
    ttl_days: int,
    *,
    now: datetime | None = None,
) -> str:
    return _encode_token(
        user_id,
        secret,
        token_type=REFRESH_TOKEN_TYPE,
        expires_delta=timedelta(days=max(1, ttl_days)),
        now=now or datetime.now(timezone.utc),
    )


def decode_token(token: str, secret: str, *, expected_type: str | None = None) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            leeway=DECODE_LEEWAY_SECONDS,
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("访问令牌已过期") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("访问令牌无效") from exc

    if expected_type is not None and payload.get("typ") != expected_type:
        raise UnauthorizedError("访问令牌类型不正确")
    if not payload.get("sub"):
        raise UnauthorizedError("访问令牌缺少用户标识")
    return payload
