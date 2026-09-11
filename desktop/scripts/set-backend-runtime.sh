#!/usr/bin/env bash
# Explicitly select which backend baseline a packaged build starts:
#
#   ./scripts/set-backend-runtime.sh java     # Spring Boot backend.jar + bundled JRE (default)
#   ./scripts/set-backend-runtime.sh python   # FastAPI PyInstaller bundle in backend-python/
#
# Writes desktop/backend-runtime.json, which electron-builder ships as an
# extraResource and src/main/backend-runtime.ts reads at startup. The file is
# committed with the default "java": switching to "python" for a release is an
# explicit, reviewable change, never an implicit fallback.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../backend-runtime.json"
RUNTIME="${1:-}"

case "$RUNTIME" in
  java|python) ;;
  *) echo "Usage: $0 [java|python]" >&2; exit 2 ;;
esac

node -e '
const fs = require("node:fs");
const [file, runtime] = process.argv.slice(1);
const config = JSON.parse(fs.readFileSync(file, "utf8"));
config.backendRuntime = runtime;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
' "$CONFIG_FILE" "$RUNTIME"

echo "backend-runtime.json -> $RUNTIME"
