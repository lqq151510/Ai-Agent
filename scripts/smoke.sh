#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
"${ROOT_DIR}/scripts/check-consistency.sh"

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
SMOKE_STREAM_TIMEOUT_SECONDS="${SMOKE_STREAM_TIMEOUT_SECONDS:-90}"
SMOKE_USE_OPENAI_MOCK="${SMOKE_USE_OPENAI_MOCK:-true}"
SMOKE_MOCK_BASE_URL="${SMOKE_MOCK_BASE_URL:-http://host.docker.internal:18081/v1}"
SMOKE_MOCK_BIND_HOST="${SMOKE_MOCK_BIND_HOST:-0.0.0.0}"
SMOKE_MOCK_STARTUP_TIMEOUT_SECONDS="${SMOKE_MOCK_STARTUP_TIMEOUT_SECONDS:-10}"
RUN_TS="$(date +%Y%m%d%H%M%S)"
RUN_DIR="${ARTIFACTS_BASE%/}/${ENV_NAME}/${RUN_TS}"
MOCK_PID=""

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

normalize_bool() {
  local value="${1:-}"
  value="$(echo "${value}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${value}" == "1" || "${value}" == "true" || "${value}" == "yes" || "${value}" == "on" ]]; then
    echo "true"
    return
  fi
  echo "false"
}

extract_url_host() {
  local url="$1"
  local without_scheme="${url#http://}"
  without_scheme="${without_scheme#https://}"
  local host_port="${without_scheme%%/*}"
  echo "${host_port%%:*}"
}

extract_url_port() {
  local url="$1"
  local without_scheme="${url#http://}"
  without_scheme="${without_scheme#https://}"
  local host_port="${without_scheme%%/*}"
  if [[ "${host_port}" == *:* ]]; then
    echo "${host_port##*:}"
    return
  fi
  if [[ "${url}" == https://* ]]; then
    echo "443"
    return
  fi
  echo "80"
}

is_local_host() {
  local host="$1"
  [[ "${host}" == "127.0.0.1" || "${host}" == "localhost" || "${host}" == "0.0.0.0" || "${host}" == "host.docker.internal" ]]
}

cleanup_mock() {
  if [[ -n "${MOCK_PID}" ]] && kill -0 "${MOCK_PID}" >/dev/null 2>&1; then
    kill "${MOCK_PID}" >/dev/null 2>&1 || true
    wait "${MOCK_PID}" 2>/dev/null || true
  fi
}

ensure_openai_mock_if_needed() {
  if [[ "${MODEL_PROVIDER}" != "OPENAI" ]]; then
    return
  fi

  if [[ "$(normalize_bool "${SMOKE_USE_OPENAI_MOCK}")" != "true" ]]; then
    echo "[smoke] SMOKE_USE_OPENAI_MOCK=false, using configured OPENAI endpoint"
    return
  fi

  local base_url="${SMOKE_MOCK_BASE_URL%/}"
  local host
  host="$(extract_url_host "${base_url}")"
  local port
  port="$(extract_url_port "${base_url}")"

  if ! is_local_host "${host}"; then
    echo "[smoke] SMOKE_USE_OPENAI_MOCK=true but base URL host is not local (${host}), skipping auto-start" >&2
    return
  fi

  TARGET_MODEL="${SMOKE_MOCK_MODEL:-${TARGET_MODEL}}"

  local probe_url="${base_url}"
  if [[ "${host}" == "host.docker.internal" ]]; then
    probe_url="http://127.0.0.1:${port}/v1"
  fi

  if curl -fsS --max-time 2 "${probe_url}/models" >/dev/null 2>&1; then
    echo "[smoke] detected existing OpenAI-compatible mock at ${probe_url}"
    return
  fi

  echo "[smoke] starting bundled OpenAI-compatible mock at ${probe_url}"
  MOCK_OPENAI_HOST="${SMOKE_MOCK_BIND_HOST}" \
  MOCK_OPENAI_PORT="${port}" \
  MOCK_OPENAI_MODEL="${TARGET_MODEL}" \
  node "${ROOT_DIR}/scripts/openai-compatible-mock.mjs" > "${RUN_DIR}/openai-mock.log" 2>&1 &
  MOCK_PID=$!
  trap cleanup_mock EXIT

  local waited=0
  while [[ "${waited}" -lt "${SMOKE_MOCK_STARTUP_TIMEOUT_SECONDS}" ]]; do
    if curl -fsS --max-time 2 "${probe_url}/models" >/dev/null 2>&1; then
      echo "[smoke] OpenAI-compatible mock is ready"
      return
    fi
    sleep 1
    waited=$((waited + 1))
  done

  echo "[smoke] failed to start OpenAI-compatible mock within ${SMOKE_MOCK_STARTUP_TIMEOUT_SECONDS}s (see ${RUN_DIR}/openai-mock.log)" >&2
  cleanup_mock
  exit 1
}

ensure_openai_mock_if_needed

echo "[smoke] BASE_URL=${BASE_URL}"
echo "[smoke] artifacts=${RUN_DIR}"
echo "[smoke] checking health endpoints"

fetch_to_file "${BASE_URL}/actuator/health" "${RUN_DIR}/actuator-health.json"
READY_PAYLOAD="$(curl -fsS "${BASE_URL}/api/v1/system/health/ready")"
printf '%s\n' "${READY_PAYLOAD}" > "${RUN_DIR}/readiness.json"
if ! echo "${READY_PAYLOAD}" | grep -q '"ready":true'; then
  echo "[smoke] readiness is not true: ${READY_PAYLOAD}" >&2
  exit 1
fi

echo "[smoke] running register -> login -> create-session -> stream-chat"
EMAIL="smoke.$(date +%s)@example.com"
PASSWORD="Passw0rd!123"

curl -fsS -X POST "${BASE_URL}/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" >/dev/null

LOGIN_PAYLOAD="$(curl -fsS -X POST "${BASE_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"
ACCESS_TOKEN="$(echo "${LOGIN_PAYLOAD}" | json_get accessToken)"
if [[ -z "${ACCESS_TOKEN}" ]]; then
  echo "[smoke] failed to parse access token: ${LOGIN_PAYLOAD}" >&2
  exit 1
fi

CREATE_PAYLOAD="$(curl -fsS -X POST "${BASE_URL}/api/v1/sessions" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"smoke-session\",\"provider\":\"${MODEL_PROVIDER}\",\"model\":\"${TARGET_MODEL}\"}")"
SESSION_ID="$(echo "${CREATE_PAYLOAD}" | json_get id)"
if [[ -z "${SESSION_ID}" ]]; then
  echo "[smoke] failed to parse session id: ${CREATE_PAYLOAD}" >&2
  exit 1
fi

printf '%s\n' "${SESSION_ID}" > "${RUN_DIR}/session-id.txt"
fetch_to_file "${BASE_URL}/api/v1/system/models" "${RUN_DIR}/models.json" "${ACCESS_TOKEN}"

STREAM_FILE="${RUN_DIR}/stream.sse"
HTTP_CODE="$({
  curl -sS -N --max-time "${SMOKE_STREAM_TIMEOUT_SECONDS}" \
    -X POST "${BASE_URL}/api/v1/agent/chat/stream" \
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

fetch_to_file "${BASE_URL}/api/v1/sessions/${SESSION_ID}/export?format=json" "${RUN_DIR}/session-export.json" "${ACCESS_TOKEN}"
fetch_to_file "${BASE_URL}/api/v1/sessions/${SESSION_ID}/export?format=markdown" "${RUN_DIR}/session-export.md" "${ACCESS_TOKEN}"
fetch_to_file "${BASE_URL}/api/v1/system/tool-stats?windowHours=${REPORT_WINDOW_HOURS}&sessionId=${SESSION_ID}" "${RUN_DIR}/tool-stats.json" "${ACCESS_TOKEN}"
fetch_to_file "${BASE_URL}/api/v1/system/tool-stats/export?windowHours=${REPORT_WINDOW_HOURS}&sessionId=${SESSION_ID}&format=markdown" "${RUN_DIR}/tool-stats.md" "${ACCESS_TOKEN}"
fetch_to_file "${BASE_URL}/api/v1/system/release-report?windowHours=${REPORT_WINDOW_HOURS}&sessionId=${SESSION_ID}" "${RUN_DIR}/release-report.json" "${ACCESS_TOKEN}"
fetch_to_file "${BASE_URL}/api/v1/system/release-report/export?windowHours=${REPORT_WINDOW_HOURS}&sessionId=${SESSION_ID}&format=markdown" "${RUN_DIR}/release-report.md" "${ACCESS_TOKEN}"

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
smoke_use_openai_mock=${SMOKE_USE_OPENAI_MOCK}
smoke_mock_base_url=${SMOKE_MOCK_BASE_URL}
session_id=${SESSION_ID}
report_window_hours=${REPORT_WINDOW_HOURS}
render_pdf=${RENDER_PDF}
generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

echo "[smoke] all checks passed"
echo "[smoke] artifacts saved to ${RUN_DIR}"
