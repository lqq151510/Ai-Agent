#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_NAME="${1:-dev}"
ENV_FILE="${ROOT_DIR}/env/${ENV_NAME}.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  ENV_FILE="${ROOT_DIR}/env/${ENV_NAME}.env.example"
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[smoke] missing env file: env/${ENV_NAME}.env (or .env.example)" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

BACKEND_PORT="${BACKEND_PORT:-8080}"
BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:${BACKEND_PORT}}"
MODEL_PROVIDER="${MODEL_PROVIDER:-OPENAI}"
ARTIFACTS_BASE="${SMOKE_ARTIFACTS_DIR:-${ROOT_DIR}/artifacts/smoke}"
REPORT_WINDOW_HOURS="${SMOKE_REPORT_WINDOW_HOURS:-24}"
RENDER_PDF="${SMOKE_RENDER_PDF:-false}"
RUN_TS="$(date +%Y%m%d%H%M%S)"
RUN_DIR="${ARTIFACTS_BASE%/}/${ENV_NAME}/${RUN_TS}"

if [[ "${MODEL_PROVIDER}" == "OPENAI" ]]; then
  TARGET_MODEL="${OPENAI_MODEL:-qwen/qwen3.5-9b}"
else
  TARGET_MODEL="${OLLAMA_MODEL:-qwen3.6:latest}"
fi

mkdir -p "${RUN_DIR}"

json_get() {
  local key="$1"
  sed -nE "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/p" | head -n1
}

fetch_to_file() {
  local url="$1"
  local output_file="$2"
  local access_token="${3:-}"

  if [[ -n "${access_token}" ]]; then
    curl -fsS "${url}" \
      -H "Authorization: Bearer ${access_token}" \
      -o "${output_file}"
    return
  fi

  curl -fsS "${url}" -o "${output_file}"
}

echo "[smoke] BASE_URL=${BASE_URL}"
echo "[smoke] artifacts=${RUN_DIR}"
echo "[smoke] checking health endpoints"

fetch_to_file "${BASE_URL}/actuator/health" "${RUN_DIR}/actuator-health.json"
READY_PAYLOAD="$(curl -fsS "${BASE_URL}/api/system/health/ready")"
printf '%s\n' "${READY_PAYLOAD}" > "${RUN_DIR}/readiness.json"
if ! echo "${READY_PAYLOAD}" | grep -q '"ready":true'; then
  echo "[smoke] readiness is not true: ${READY_PAYLOAD}" >&2
  exit 1
fi

echo "[smoke] running register -> login -> create-session -> stream-chat"
EMAIL="smoke.$(date +%s)@example.com"
PASSWORD="Passw0rd!123"

curl -fsS -X POST "${BASE_URL}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" >/dev/null

LOGIN_PAYLOAD="$(curl -fsS -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"
ACCESS_TOKEN="$(echo "${LOGIN_PAYLOAD}" | json_get accessToken)"
if [[ -z "${ACCESS_TOKEN}" ]]; then
  echo "[smoke] failed to parse access token: ${LOGIN_PAYLOAD}" >&2
  exit 1
fi

CREATE_PAYLOAD="$(curl -fsS -X POST "${BASE_URL}/api/sessions" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"smoke-session\",\"provider\":\"${MODEL_PROVIDER}\",\"model\":\"${TARGET_MODEL}\"}")"
SESSION_ID="$(echo "${CREATE_PAYLOAD}" | json_get id)"
if [[ -z "${SESSION_ID}" ]]; then
  echo "[smoke] failed to parse session id: ${CREATE_PAYLOAD}" >&2
  exit 1
fi

printf '%s\n' "${SESSION_ID}" > "${RUN_DIR}/session-id.txt"
fetch_to_file "${BASE_URL}/api/system/models" "${RUN_DIR}/models.json" "${ACCESS_TOKEN}"

STREAM_FILE="${RUN_DIR}/stream.sse"
HTTP_CODE="$({
  curl -sS -N --max-time "${SMOKE_STREAM_TIMEOUT_SECONDS:-90}" \
    -X POST "${BASE_URL}/api/agent/chat/stream" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Accept: text/event-stream" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"${SESSION_ID}\",\"message\":\"请回复 smoke ok\"}" \
    -o "${STREAM_FILE}" \
    -w "%{http_code}"
} || true)"

if [[ "${HTTP_CODE}" != "200" ]]; then
  echo "[smoke] stream request failed, status=${HTTP_CODE}" >&2
  cat "${STREAM_FILE}" >&2
  exit 1
fi

if grep -q "event: error" "${STREAM_FILE}"; then
  echo "[smoke] stream returned error event" >&2
  cat "${STREAM_FILE}" >&2
  exit 1
fi

if ! grep -Eq "event:[[:space:]]*(chunk|done)" "${STREAM_FILE}"; then
  echo "[smoke] stream output missing chunk/done event" >&2
  cat "${STREAM_FILE}" >&2
  exit 1
fi

fetch_to_file "${BASE_URL}/api/sessions/${SESSION_ID}/export?format=json" "${RUN_DIR}/session-export.json" "${ACCESS_TOKEN}"
fetch_to_file "${BASE_URL}/api/sessions/${SESSION_ID}/export?format=markdown" "${RUN_DIR}/session-export.md" "${ACCESS_TOKEN}"
fetch_to_file "${BASE_URL}/api/system/tool-stats?windowHours=${REPORT_WINDOW_HOURS}&sessionId=${SESSION_ID}" "${RUN_DIR}/tool-stats.json" "${ACCESS_TOKEN}"
fetch_to_file "${BASE_URL}/api/system/tool-stats/export?windowHours=${REPORT_WINDOW_HOURS}&sessionId=${SESSION_ID}&format=markdown" "${RUN_DIR}/tool-stats.md" "${ACCESS_TOKEN}"
fetch_to_file "${BASE_URL}/api/system/release-report?windowHours=${REPORT_WINDOW_HOURS}&sessionId=${SESSION_ID}" "${RUN_DIR}/release-report.json" "${ACCESS_TOKEN}"
fetch_to_file "${BASE_URL}/api/system/release-report/export?windowHours=${REPORT_WINDOW_HOURS}&sessionId=${SESSION_ID}&format=markdown" "${RUN_DIR}/release-report.md" "${ACCESS_TOKEN}"

REPORT_ARGS=(
  --input-json "${RUN_DIR}/release-report.json"
  --output-dir "${RUN_DIR}"
  --base-name "release-report"
  --title "AI Agent Beta Release Report (${ENV_NAME})"
)
if [[ "${RENDER_PDF}" == "true" ]]; then
  REPORT_ARGS+=(--pdf)
fi
"${ROOT_DIR}/scripts/render-release-report.sh" "${REPORT_ARGS[@]}"

cat > "${RUN_DIR}/run-summary.txt" <<EOF
env=${ENV_NAME}
base_url=${BASE_URL}
model_provider=${MODEL_PROVIDER}
model=${TARGET_MODEL}
session_id=${SESSION_ID}
report_window_hours=${REPORT_WINDOW_HOURS}
render_pdf=${RENDER_PDF}
generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

echo "[smoke] all checks passed"
echo "[smoke] artifacts saved to ${RUN_DIR}"
