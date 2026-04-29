#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_NAME="${1:-dev}"
REQUESTED_TAG="${2:-}"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
STATE_DIR="${ROOT_DIR}/.deploy"
CURRENT_TAG_FILE="${STATE_DIR}/current.tag"
PREVIOUS_TAG_FILE="${STATE_DIR}/previous.tag"

resolve_env_file() {
  local exact="${ROOT_DIR}/env/${ENV_NAME}.env"
  local example="${ROOT_DIR}/env/${ENV_NAME}.env.example"
  if [[ -f "${exact}" ]]; then
    echo "${exact}"
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
  echo "[deploy] missing env file: env/${ENV_NAME}.env (or .env.example)" >&2
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

APP_IMAGE_TAG="${TAG}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" build backend web
APP_IMAGE_TAG="${TAG}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --remove-orphans

if [[ -n "${PREV_CURRENT}" && "${PREV_CURRENT}" != "${TAG}" ]]; then
  echo "${PREV_CURRENT}" > "${PREVIOUS_TAG_FILE}"
fi

echo "${TAG}" > "${CURRENT_TAG_FILE}"

echo "[deploy] active tag: ${TAG}"
APP_IMAGE_TAG="${TAG}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps
