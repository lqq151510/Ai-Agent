#!/usr/bin/env bash
# Build the packaged Knowledge Desk Python backend for the host architecture.
#
#   ./scripts/build-binary.sh                 # build + verify the produced binary
#   ./scripts/build-binary.sh --skip-verify   # build only
#
# Output: desktop/backend-python/knowledge-desk-backend/
#   └── knowledge-desk-backend        <- executable spawned by the Electron launcher
#
# PyInstaller cannot cross-compile, so an arm64 Mac produces the arm64 runtime and
# an x64 Mac (or an x64 shell under Rosetta) produces the x64 runtime. Run this
# once per architecture when assembling a universal macOS package.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_PYTHON_DIR="${KD_DESKTOP_PYTHON_DIR:-$ROOT_DIR/../desktop/backend-python}"
WORK_DIR="$ROOT_DIR/build"
DIST_DIR="$ROOT_DIR/dist"
BUNDLE_NAME="knowledge-desk-backend"
ARCH="$(uname -m)"
VERIFY=1

for arg in "$@"; do
  case "$arg" in
    --skip-verify) VERIFY=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

echo "=== Knowledge Desk backend binary build (host arch: ${ARCH}) ==="

cd "$ROOT_DIR"

if ! command -v uv >/dev/null 2>&1; then
  echo "ERROR: uv is required (https://docs.astral.sh/uv/)" >&2
  exit 1
fi

# The build extra supplies PyInstaller; dev keeps pytest available for the suite.
uv sync --extra build --extra dev

rm -rf "$WORK_DIR" "$DIST_DIR"
uv run pyinstaller \
  --noconfirm \
  --clean \
  --distpath "$DIST_DIR" \
  --workpath "$WORK_DIR" \
  "$BUNDLE_NAME.spec"

BUNDLE="$DIST_DIR/$BUNDLE_NAME"
EXECUTABLE="$BUNDLE/$BUNDLE_NAME"

if [ ! -x "$EXECUTABLE" ]; then
  echo "ERROR: expected executable not found: $EXECUTABLE" >&2
  exit 1
fi

echo "=== pruning caches ==="
find "$BUNDLE" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$BUNDLE" -name '*.pyc' -delete 2>/dev/null || true

echo "=== verifying the bundle carries no development artefacts ==="
FORBIDDEN=()
for pattern in ".venv" ".pytest-tmp" ".git" "uv.lock" "site-packages"; do
  if find "$BUNDLE" -name "$pattern" -print -quit | grep -q .; then
    FORBIDDEN+=("$pattern")
  fi
done
if [ "${#FORBIDDEN[@]}" -gt 0 ]; then
  echo "ERROR: bundle contains forbidden artefacts: ${FORBIDDEN[*]}" >&2
  exit 1
fi

MIGRATIONS_DIR="$BUNDLE/_internal/knowledge_desk/migrations"
if [ ! -f "$MIGRATIONS_DIR/env.py" ]; then
  echo "ERROR: Alembic migration scripts are missing from the bundle: $MIGRATIONS_DIR" >&2
  exit 1
fi

if [ "$VERIFY" -eq 1 ]; then
  echo "=== verifying the binary serves readiness on loopback ==="
  VERIFY_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kd-binary-verify.XXXXXX")"
  VERIFY_PORT="${KD_BINARY_VERIFY_PORT:-18199}"
  KD_DATA_DIR="$VERIFY_DIR" \
  KD_PORT="$VERIFY_PORT" \
  KD_HOST=127.0.0.1 \
  KD_DESKTOP_MODE=true \
  KD_JWT_SECRET="binary-verify-jwt-secret-at-least-32-chars" \
  KD_DB_ENCRYPTION_KEY="binary-verify-encryption-key" \
  KD_LOG_LEVEL=WARNING \
    "$EXECUTABLE" >"$VERIFY_DIR/verify.log" 2>&1 &
  VERIFY_PID=$!

  READY_CODE=""
  for _ in $(seq 1 80); do
    READY_CODE="$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' \
      "http://127.0.0.1:${VERIFY_PORT}/api/v1/system/health/ready" || true)"
    if [ "$READY_CODE" = "200" ]; then break; fi
    if ! kill -0 "$VERIFY_PID" 2>/dev/null; then break; fi
    sleep 0.5
  done

  kill "$VERIFY_PID" 2>/dev/null || true
  wait "$VERIFY_PID" 2>/dev/null || true

  if [ "$READY_CODE" != "200" ]; then
    echo "ERROR: packaged binary did not become ready (last status: ${READY_CODE:-none})" >&2
    tail -40 "$VERIFY_DIR/verify.log" >&2 || true
    rm -rf "$VERIFY_DIR"
    exit 1
  fi

  if [ ! -f "$VERIFY_DIR/knowledge-desk.sqlite3" ]; then
    echo "ERROR: the packaged binary did not create its SQLite database" >&2
    rm -rf "$VERIFY_DIR"
    exit 1
  fi

  echo "PASS packaged binary readiness 200 and migration applied"
  rm -rf "$VERIFY_DIR"
fi

echo "=== installing into the desktop package ==="
rm -rf "$DESKTOP_PYTHON_DIR/$BUNDLE_NAME"
mkdir -p "$DESKTOP_PYTHON_DIR"
cp -R "$BUNDLE" "$DESKTOP_PYTHON_DIR/"

echo "Binary installed: $DESKTOP_PYTHON_DIR/$BUNDLE_NAME/$BUNDLE_NAME"
du -sh "$DESKTOP_PYTHON_DIR/$BUNDLE_NAME"
