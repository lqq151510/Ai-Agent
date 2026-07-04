#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_NAME="${1:-dev}"
TARGET_TAG="${2:-}"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
STATE_DIR="${ROOT_DIR}/.deploy"
CURRENT_TAG_FILE="${STATE_DIR}/current.tag"
PREVIOUS_TAG_FILE="${STATE_DIR}/previous.tag"
ENV_FILE="${ROOT_DIR}/env/${ENV_NAME}.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  if [[ "${ENV_NAME}" == "prod" ]]; then
    echo "[rollback] prod rollback requires env/prod.env; refusing to use env/prod.env.example" >&2
    exit 1
  fi
  ENV_FILE="${ROOT_DIR}/env/${ENV_NAME}.env.example"
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[rollback] missing env file: env/${ENV_NAME}.env (or .env.example)" >&2
  exit 1
fi

if [[ -z "${TARGET_TAG}" ]]; then
  if [[ ! -f "${PREVIOUS_TAG_FILE}" ]]; then
    echo "[rollback] no previous tag recorded, provide target tag explicitly" >&2
    exit 1
  fi
  TARGET_TAG="$(cat "${PREVIOUS_TAG_FILE}")"
fi

CURRENT_TAG=""
if [[ -f "${CURRENT_TAG_FILE}" ]]; then
  CURRENT_TAG="$(cat "${CURRENT_TAG_FILE}")"
fi

echo "[rollback] env=${ENV_NAME}, targetTag=${TARGET_TAG}"
APP_IMAGE_TAG="${TARGET_TAG}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --no-build backend python-service

echo "${TARGET_TAG}" > "${CURRENT_TAG_FILE}"
if [[ -n "${CURRENT_TAG}" && "${CURRENT_TAG}" != "${TARGET_TAG}" ]]; then
  echo "${CURRENT_TAG}" > "${PREVIOUS_TAG_FILE}"
fi

echo "[rollback] rollback completed"
APP_IMAGE_TAG="${TARGET_TAG}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps
