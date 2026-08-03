#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_NAME="${1:-dev}"
REQUESTED_TAG="${2:-}"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
STATE_DIR="${ROOT_DIR}/.deploy"
CURRENT_TAG_FILE="${STATE_DIR}/current.tag"
PREVIOUS_TAG_FILE="${STATE_DIR}/previous.tag"

"${ROOT_DIR}/scripts/check-consistency.sh"

normalize_bool() {
  local value="${1:-}"
  value="$(echo "${value}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${value}" == "1" || "${value}" == "true" || "${value}" == "yes" || "${value}" == "on" ]]; then
    echo "true"
    return
  fi
  echo "false"
}

resolve_env_file() {
  local exact="${ROOT_DIR}/env/${ENV_NAME}.env"
  local example="${ROOT_DIR}/env/${ENV_NAME}.env.example"
  if [[ -f "${exact}" ]]; then
    echo "${exact}"
    return
  fi
  if [[ "${ENV_NAME}" == "prod" ]]; then
    echo ""
    return
  fi
  if [[ -f "${example}" ]]; then
    echo "${example}"
    return
  fi
  echo "" 
}

ENV_FILE="$(resolve_env_file)"
if [[ -z "${ENV_FILE}" ]]; then
  if [[ "${ENV_NAME}" == "prod" ]]; then
    echo "[deploy] prod release requires env/prod.env; refusing to use env/prod.env.example" >&2
  else
    echo "[deploy] missing env file: env/${ENV_NAME}.env (or .env.example)" >&2
  fi
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

MAVEN_SETTINGS_FILE="${MAVEN_SETTINGS_FILE:-}"
if [[ -z "${MAVEN_SETTINGS_FILE}" || ! -f "${MAVEN_SETTINGS_FILE}" ]]; then
  echo "[deploy] MAVEN_SETTINGS_FILE must point to an existing Maven settings file" >&2
  exit 1
fi
MAVEN_SETTINGS_FILE="$(cd "$(dirname "${MAVEN_SETTINGS_FILE}")" && pwd)/$(basename "${MAVEN_SETTINGS_FILE}")"
if [[ -z "${GITHUB_ACTOR:-}" || -z "${GITHUB_TOKEN:-}" ]]; then
  echo "[deploy] GITHUB_ACTOR and GITHUB_TOKEN are required for the private FlexAgent package" >&2
  exit 1
fi
if ! docker buildx version >/dev/null 2>&1; then
  echo "[deploy] Docker BuildKit/buildx is required for the Maven secret mounts" >&2
  exit 1
fi

TAG="${REQUESTED_TAG}"
if [[ -z "${TAG}" ]]; then
  TAG="$(date +%Y%m%d%H%M%S)"
fi

mkdir -p "${STATE_DIR}"
PREV_CURRENT=""
if [[ -f "${CURRENT_TAG_FILE}" ]]; then
  PREV_CURRENT="$(cat "${CURRENT_TAG_FILE}")"
fi

echo "[deploy] env=${ENV_NAME}, tag=${TAG}"
echo "[deploy] using env file: ${ENV_FILE}"
MODEL_PROVIDER="${MODEL_PROVIDER:-OPENAI}"
SMOKE_USE_OPENAI_MOCK="${SMOKE_USE_OPENAI_MOCK:-true}"
USE_LOCAL_OPENAI_MOCK="false"
DEPLOY_OPENAI_BASE_URL="${OPENAI_BASE_URL:-}"
DEPLOY_OPENAI_API_KEY="${OPENAI_API_KEY:-}"

if [[ "${MODEL_PROVIDER}" == "OPENAI" ]] && [[ "$(normalize_bool "${SMOKE_USE_OPENAI_MOCK}")" == "true" ]]; then
  USE_LOCAL_OPENAI_MOCK="true"
  DEPLOY_OPENAI_BASE_URL="${SMOKE_MOCK_BASE_URL:-http://host.docker.internal:18081/v1}"
  DEPLOY_OPENAI_API_KEY="${SMOKE_MOCK_API_KEY:-smoke-test}"
  echo "[deploy] SMOKE_USE_OPENAI_MOCK=true, override OPENAI_BASE_URL=${DEPLOY_OPENAI_BASE_URL}"
fi

run_compose() {
  local args=("$@")
  if [[ "${USE_LOCAL_OPENAI_MOCK}" == "true" ]]; then
    OPENAI_BASE_URL="${DEPLOY_OPENAI_BASE_URL}" \
    OPENAI_API_KEY="${DEPLOY_OPENAI_API_KEY}" \
    APP_IMAGE_TAG="${TAG}" \
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "${args[@]}"
    return
  fi

  APP_IMAGE_TAG="${TAG}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "${args[@]}"
}

BACKEND_IMAGE="${BACKEND_IMAGE_REPO:-ai-agent-backend}:${TAG}"
echo "[deploy] building backend image ${BACKEND_IMAGE} with BuildKit secrets"
docker build \
  --tag "${BACKEND_IMAGE}" \
  --secret "id=maven_settings,src=${MAVEN_SETTINGS_FILE}" \
  --secret "id=github_actor,env=GITHUB_ACTOR" \
  --secret "id=github_token,env=GITHUB_TOKEN" \
  --file "${ROOT_DIR}/backend/Dockerfile" \
  "${ROOT_DIR}"
run_compose build python-service
run_compose up -d --remove-orphans

if [[ -n "${PREV_CURRENT}" && "${PREV_CURRENT}" != "${TAG}" ]]; then
  echo "${PREV_CURRENT}" > "${PREVIOUS_TAG_FILE}"
fi

echo "${TAG}" > "${CURRENT_TAG_FILE}"

echo "[deploy] active tag: ${TAG}"
run_compose ps
