"""Symmetric protection for stored third-party model credentials.

A Fernet token is derived from the runtime key material handed over by the
Electron main process. When that material is absent the backend refuses to
persist a credential rather than falling back to plaintext.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from knowledge_desk.errors import EncryptionUnavailableError

ENCRYPTION_PREFIX = "enc:v1:"
MASK_PLACEHOLDER = "••••"


class SecretCipher:
    def __init__(self, key_material: str | None) -> None:
        self._fernet: Fernet | None = None
        if key_material:
            digest = hashlib.sha256(key_material.encode("utf-8")).digest()
            self._fernet = Fernet(base64.urlsafe_b64encode(digest))

    @property
    def available(self) -> bool:
        return self._fernet is not None

    def encrypt(self, plaintext: str) -> str:
        if self._fernet is None:
            raise EncryptionUnavailableError()
        token = self._fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")
        return f"{ENCRYPTION_PREFIX}{token}"

    def decrypt(self, payload: str | None) -> str | None:
        if not payload or self._fernet is None:
            return None
        token = payload[len(ENCRYPTION_PREFIX):] if payload.startswith(ENCRYPTION_PREFIX) else payload
        try:
            return self._fernet.decrypt(token.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeDecodeError, ValueError):
            return None

    @staticmethod
    def mask(secret: str | None) -> str | None:
        """Return the only representation of a credential the API may expose."""

        if not secret:
            return None
        trimmed = secret.strip()
        if not trimmed:
            return None
        if len(trimmed) <= 8:
            return MASK_PLACEHOLDER
        return f"{trimmed[:3]}…{trimmed[-4:]}"
