"""Runtime configuration for the Knowledge Desk local backend.

All values are environment driven so the Electron main process can own the
process lifecycle (data directory, port, desktop mode) and the runtime secrets.
"""

from __future__ import annotations

import os
import secrets
import stat
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 18080
DATABASE_FILENAME = "knowledge-desk.sqlite3"
SOURCES_DIRNAME = "sources"
LOGS_DIRNAME = "logs"
JWT_SECRET_FILENAME = ".runtime-jwt-secret"


def _default_data_dir() -> Path:
    return Path.home() / "Library" / "Application Support" / "KnowledgeDesk"


class Settings(BaseSettings):
    """Environment-driven settings.

    Names are intentionally compatible with the existing Electron
    ``BackendManager`` environment (``APP_DATA_DIR``/``APP_DESKTOP_MODE``,
    ``JWT_SECRET``, ``SECURITY_DB_ENCRYPTION_KEY``) while accepting the
    ``KD_`` prefixed variants for local development.
    """

    model_config = SettingsConfigDict(extra="ignore", populate_by_name=True, case_sensitive=False)

    data_dir: Path = Field(
        default_factory=_default_data_dir,
        validation_alias=AliasChoices("KD_DATA_DIR", "APP_DATA_DIR", "DATA_DIR"),
    )
    host: str = Field(default=DEFAULT_HOST, validation_alias=AliasChoices("KD_HOST", "HOST"))
    port: int = Field(default=DEFAULT_PORT, validation_alias=AliasChoices("KD_PORT", "PORT"))
    desktop_mode: bool = Field(
        default=False,
        validation_alias=AliasChoices("KD_DESKTOP_MODE", "APP_DESKTOP_MODE"),
    )
    jwt_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("KD_JWT_SECRET", "JWT_SECRET"),
    )
    db_encryption_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("KD_DB_ENCRYPTION_KEY", "SECURITY_DB_ENCRYPTION_KEY"),
    )

    access_token_ttl_minutes: int = 720
    refresh_token_ttl_days: int = 30
    max_upload_bytes: int = 50 * 1024 * 1024
    llm_timeout_seconds: float = 30.0

    # ``heuristic``: no configured model falls back to the deterministic local
    # organizer shipped in v0.1.0-beta.3 (job recorded as succeeded with a note).
    # ``fail``: no configured model records a failed job, per the MVP contract.
    organize_no_model_policy: Literal["heuristic", "fail"] = "heuristic"

    log_level: str = "INFO"

    @property
    def database_path(self) -> Path:
        return self.data_dir / DATABASE_FILENAME

    @property
    def database_url(self) -> str:
        return f"sqlite+pysqlite:///{self.database_path}"

    @property
    def sources_dir(self) -> Path:
        return self.data_dir / SOURCES_DIRNAME

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / LOGS_DIRNAME

    def ensure_directories(self) -> None:
        for directory in (self.data_dir, self.sources_dir, self.logs_dir):
            directory.mkdir(parents=True, exist_ok=True)
            try:
                os.chmod(directory, stat.S_IRWXU)
            except OSError:  # pragma: no cover - best effort on exotic filesystems
                pass

    def resolved_jwt_secret(self) -> str:
        """Return the signing secret, persisting a generated one inside dataDir.

        The generated secret never leaves the local data directory and is never
        written to logs or API responses.
        """
        if self.jwt_secret:
            return self.jwt_secret
        self.ensure_directories()
        secret_path = self.data_dir / JWT_SECRET_FILENAME
        if secret_path.exists():
            value = secret_path.read_text(encoding="utf-8").strip()
            if value:
                return value
        value = secrets.token_urlsafe(48)
        secret_path.write_text(value, encoding="utf-8")
        try:
            os.chmod(secret_path, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:  # pragma: no cover
            pass
        return value

    def resolved_encryption_key(self) -> str | None:
        """Return the runtime key material used to encrypt stored API keys."""
        return self.db_encryption_key or None
