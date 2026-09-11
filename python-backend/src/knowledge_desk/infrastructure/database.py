"""Engine / session construction and schema migration entry points."""

from __future__ import annotations

import sys
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from knowledge_desk.config import Settings

BUNDLED_RESOURCE_ROOT = "_MEIPASS"
MIGRATIONS_PACKAGE_PATH = Path("knowledge_desk") / "migrations"


def _package_migrations_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "migrations"


def get_migrations_dir() -> Path:
    """Locate the Alembic scripts, including inside a PyInstaller bundle.

    A frozen build has no importable ``__file__`` for ``Alembic``'s script
    directory, so the migration files are shipped as data under
    ``_MEIPASS/knowledge_desk/migrations`` and preferred when present.
    """

    bundled_root = getattr(sys, BUNDLED_RESOURCE_ROOT, None)
    if bundled_root:
        bundled = Path(str(bundled_root)) / MIGRATIONS_PACKAGE_PATH
        if (bundled / "env.py").is_file():
            return bundled
    return _package_migrations_dir()


MIGRATIONS_DIR = get_migrations_dir()


def build_engine(settings: Settings) -> Engine:
    """Create the SQLite engine used by the single-user local MVP."""

    settings.ensure_directories()
    engine = create_engine(
        settings.database_url,
        future=True,
        pool_pre_ping=True,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _apply_pragmas(dbapi_connection, _connection_record) -> None:  # pragma: no cover
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
        finally:
            cursor.close()

    return engine


def build_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False, future=True)


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def run_migrations(settings: Settings) -> None:
    """Bring the SQLite database up to the latest Alembic revision.

    Executed at process start so a packaged desktop runtime never depends on a
    separate migration step, and so the migration is repeatable (``upgrade`` is
    a no-op once the head revision is applied).
    """

    from alembic import command
    from alembic.config import Config as AlembicConfig

    settings.ensure_directories()
    config = AlembicConfig()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(config, "head")
