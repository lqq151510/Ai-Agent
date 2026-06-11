#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

README_FILE="${ROOT_DIR}/README.md"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
SMOKE_SCRIPT="${ROOT_DIR}/scripts/smoke.sh"
DESKTOP_HEALTH_FILE="${ROOT_DIR}/desktop/src/main/backend-manager.ts"
WEB_API_FILE="${ROOT_DIR}/web/src/api.ts"
CLI_API_FILE="${ROOT_DIR}/ts-cli/src/api-client.ts"

require_file() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    echo "[consistency] required file not found: ${file}" >&2
    exit 1
  fi
}

require_literal() {
  local file="$1"
  local literal="$2"
  local description="$3"
  if ! grep -Fq "${literal}" "${file}"; then
    echo "[consistency] ${description}" >&2
    echo "[consistency] expected to find: ${literal}" >&2
    echo "[consistency] file: ${file}" >&2
    exit 1
  fi
}

for file in \
  "${README_FILE}" \
  "${COMPOSE_FILE}" \
  "${SMOKE_SCRIPT}" \
  "${DESKTOP_HEALTH_FILE}" \
  "${WEB_API_FILE}" \
  "${CLI_API_FILE}"; do
  require_file "${file}"
done

require_literal "${COMPOSE_FILE}" "/api/v1/system/health/ready" "docker compose backend healthcheck must use /api/v1 path"
require_literal "${SMOKE_SCRIPT}" "/api/v1/system/health/ready" "smoke readiness check must use /api/v1 path"
require_literal "${README_FILE}" "/api/v1/system/health/ready" "README readiness example must use /api/v1 path"
require_literal "${DESKTOP_HEALTH_FILE}" "/api/v1/system/health/ready" "desktop backend readiness probe must use /api/v1 path"

if command -v rg >/dev/null 2>&1; then
  LEGACY_HITS="$(
    rg -n -P '/api/(?!v1/)(auth|sessions|agent|coach|system)' \
      "${README_FILE}" \
      "${COMPOSE_FILE}" \
      "${SMOKE_SCRIPT}" \
      "${DESKTOP_HEALTH_FILE}" \
      "${WEB_API_FILE}" \
      "${CLI_API_FILE}" || true
  )"
else
  LEGACY_HITS="$(
    grep -nE '/api/(auth|sessions|agent|coach|system)' \
      "${README_FILE}" \
      "${COMPOSE_FILE}" \
      "${SMOKE_SCRIPT}" \
      "${DESKTOP_HEALTH_FILE}" \
      "${WEB_API_FILE}" \
      "${CLI_API_FILE}" | grep -v '/api/v1/' || true
  )"
fi

if [[ -n "${LEGACY_HITS}" ]]; then
  echo "[consistency] found legacy non-versioned API paths:" >&2
  echo "${LEGACY_HITS}" >&2
  exit 1
fi

echo "[consistency] API and readiness path checks passed"
