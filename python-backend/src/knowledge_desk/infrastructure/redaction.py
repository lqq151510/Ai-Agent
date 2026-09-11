"""Redaction helpers for anything that reaches a log, job record or response.

The MVP contract forbids plaintext API keys, tokens, absolute host paths and
document content hashes from appearing in exported diagnostics.
"""

from __future__ import annotations

import re

REDACTED = "[redacted]"

_SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_\-]{6,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{6,}"),
    re.compile(r"eyJ[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]{4,}"),
    re.compile(r"(?i)(api[_-]?key|token|secret)\s*[=:]\s*[A-Za-z0-9._\-]{6,}"),
)

_HOME_PATH_PATTERNS = (
    re.compile(r"/(?:Users|home)/[^/\s]+"),
    re.compile(r"[A-Za-z]:\\\\?Users\\\\?[^\\\\\s]+"),
)


def redact(text: str | None) -> str | None:
    """Mask secrets, credentials and absolute home paths inside free text."""

    if text is None:
        return None
    redacted = text
    for pattern in _SECRET_PATTERNS:
        redacted = pattern.sub(REDACTED, redacted)
    for pattern in _HOME_PATH_PATTERNS:
        redacted = pattern.sub("~", redacted)
    return redacted


def redact_max(text: str | None, limit: int = 255) -> str | None:
    """Redact and clamp a message to a column-friendly length."""

    value = redact(text)
    if value is None:
        return None
    return value[:limit]
