"""Schema migration coverage: repeatable and drift-free."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from knowledge_desk.config import Settings
from knowledge_desk.domain.models import Base
from knowledge_desk.infrastructure.database import MIGRATIONS_DIR, build_engine, run_migrations

EXPECTED_TABLES = {
    "users",
    "user_preferences",
    "knowledge_items",
    "tags",
    "knowledge_item_tags",
    "model_sources",
    "ingestion_jobs",
    "review_states",
    "source_assets",
}


def _alembic_config(settings: Settings) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    return config


def test_initial_migration_creates_every_table(settings: Settings) -> None:
    run_migrations(settings)

    engine = create_engine(settings.database_url)
    try:
        assert set(inspect(engine).get_table_names()) >= EXPECTED_TABLES
    finally:
        engine.dispose()


def test_migration_is_repeatable(settings: Settings) -> None:
    run_migrations(settings)
    first = settings.database_path.stat().st_mtime_ns

    # A second upgrade at head must be a no-op rather than an error.
    run_migrations(settings)
    run_migrations(settings)

    assert settings.database_path.exists()
    assert settings.database_path.stat().st_mtime_ns >= first


def test_migrations_match_orm_metadata(settings: Settings) -> None:
    """The migrated schema must equal the ORM metadata (no drift)."""

    run_migrations(settings)
    engine = build_engine(settings)
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(
                connection, opts={"compare_type": True, "render_as_batch": True}
            )
            diff = compare_metadata(context, Base.metadata)
    finally:
        engine.dispose()

    assert diff == [], f"schema drift detected: {diff}"


def test_downgrade_and_upgrade_cycle(settings: Settings) -> None:
    # Bring the data directory and schema to head first so the downgrade starts
    # from a known state.
    run_migrations(settings)
    config = _alembic_config(settings)
    command.downgrade(config, "base")

    engine = create_engine(settings.database_url)
    try:
        remaining = set(inspect(engine).get_table_names()) - {"alembic_version"}
        assert remaining == set()
    finally:
        engine.dispose()

    command.upgrade(config, "head")
    engine = create_engine(settings.database_url)
    try:
        assert set(inspect(engine).get_table_names()) >= EXPECTED_TABLES
    finally:
        engine.dispose()


def test_data_directory_layout(settings: Settings) -> None:
    run_migrations(settings)
    assert settings.database_path.name == "knowledge-desk.sqlite3"
    assert settings.sources_dir.is_dir()
    assert settings.logs_dir.is_dir()
    assert Path(settings.data_dir).is_dir()


@pytest.mark.parametrize("name", sorted(EXPECTED_TABLES))
def test_expected_table_names(name: str, settings: Settings) -> None:
    run_migrations(settings)
    engine = create_engine(settings.database_url)
    try:
        assert name in inspect(engine).get_table_names()
    finally:
        engine.dispose()
