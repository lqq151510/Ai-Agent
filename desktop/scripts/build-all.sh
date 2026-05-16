#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKIP_INSTALL="${DESKTOP_SKIP_NPM_INSTALL:-false}"
WEB_API_BASE="${DESKTOP_VITE_API_BASE:-http://localhost:18080}"
BUILDER_ARGS="${DESKTOP_ELECTRON_BUILDER_ARGS:-}"

install_deps_if_needed() {
  local target_dir="$1"
  if [[ "${SKIP_INSTALL}" == "true" ]]; then
    return
  fi
  if [[ -d "${target_dir}/node_modules" ]]; then
    return
  fi
  npm install --silent
}

echo "============================================"
echo "  AI Agent Desktop - Full Build Pipeline"
echo "============================================"

echo ""
echo "[1/4] Building backend + JRE..."
bash "$SCRIPT_DIR/build-backend.sh"

echo ""
echo "[2/4] Building web frontend..."
cd "$PROJECT_ROOT/web"
install_deps_if_needed "$PROJECT_ROOT/web"
VITE_API_BASE="${WEB_API_BASE}" npm run build

echo ""
echo "[3/4] Copying web build to desktop..."
rm -rf "$SCRIPT_DIR/../dist/renderer"
mkdir -p "$SCRIPT_DIR/../dist/renderer"
cp -R "$PROJECT_ROOT/web/dist/." "$SCRIPT_DIR/../dist/renderer/"

echo ""
echo "[4/5] Compiling Electron main process..."
cd "$SCRIPT_DIR/.."
install_deps_if_needed "$SCRIPT_DIR/.."
npm run build:main

echo ""
echo "[5/5] Packaging desktop app..."
npx electron-builder ${BUILDER_ARGS}

echo ""
echo "============================================"
echo "  Build complete!"
echo "============================================"
