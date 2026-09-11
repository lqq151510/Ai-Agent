#!/usr/bin/env bash
# Build the packaged Python backend for this machine's architecture and install
# it into desktop/backend-python/ where the Electron launcher expects it.
#
# Thin wrapper so the desktop build surface stays consistent with
# scripts/build-backend.sh (Java baseline). All real work lives next to the
# backend it builds.
#
# Usage:
#   ./scripts/build-python-backend.sh                # build + verify + install
#   ./scripts/build-python-backend.sh --skip-verify  # build + install only
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON_BACKEND_DIR="$PROJECT_ROOT/python-backend"

echo "=== Building packaged Python backend (Knowledge Desk MVP) ==="

if [ ! -x "$PYTHON_BACKEND_DIR/scripts/build-binary.sh" ]; then
  echo "ERROR: missing $PYTHON_BACKEND_DIR/scripts/build-binary.sh" >&2
  exit 1
fi

KD_DESKTOP_PYTHON_DIR="$SCRIPT_DIR/../backend-python" \
  bash "$PYTHON_BACKEND_DIR/scripts/build-binary.sh" "$@"

echo "=== Python backend runtime ready ==="
echo "Selected runtime is controlled by desktop/backend-runtime.json (java | python);"
echo "development builds may override it with KD_BACKEND_RUNTIME=python."
