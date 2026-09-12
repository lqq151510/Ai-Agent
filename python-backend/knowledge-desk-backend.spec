# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller manifest for the packaged Knowledge Desk Python backend.

The backend applies Alembic migrations at process startup and imports some
document parsers lazily.  Make both explicit here so the frozen binary has the
same runtime behaviour as the development server.
"""

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


project_root = Path(SPECPATH)
source_root = project_root / "src"
migrations = source_root / "knowledge_desk" / "migrations"

hiddenimports = [
    "alembic.runtime.migration",
    "alembic.runtime.environment",
    "knowledge_desk.migrations.env",
    "knowledge_desk.migrations.versions.0001_initial",
    "pdfplumber",
    "docx",
    "pptx",
]
hiddenimports += collect_submodules("sqlalchemy.dialects.sqlite")

datas = [(str(migrations), "knowledge_desk/migrations")]

a = Analysis(
    [str(project_root / "entrypoint.py")],
    pathex=[str(source_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "coverage", "setuptools", "pip", "wheel"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="knowledge-desk-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="knowledge-desk-backend",
)
