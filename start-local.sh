#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/env/dev.env"
ENV_EXAMPLE="${ROOT_DIR}/env/dev.env.example"

if [[ ! -f "${ENV_FILE}" ]]; then
    echo "[local] missing ${ENV_FILE}; copy ${ENV_EXAMPLE} and fill local values." >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

require_env_entry() {
    local name="$1"
    if ! grep -Eq "^[[:space:]]*(export[[:space:]]+)?${name}=" "${ENV_FILE}"; then
        echo "[local] ${name} is missing from ${ENV_FILE}; add it without printing the value." >&2
        exit 1
    fi
}

require_secret() {
    local name="$1"
    local value="${!name:-}"
    if [[ -z "${value}" || "${value}" == *placeholder* || "${value}" == *replace-with* || "${value}" == "change-me" ]]; then
        echo "[local] ${name} must be set to a real local value in ${ENV_FILE}" >&2
        exit 1
    fi
}

require_env_entry POSTGRES_PASSWORD
require_env_entry JWT_SECRET
require_env_entry SECURITY_DB_ENCRYPTION_KEY
require_secret POSTGRES_PASSWORD
require_secret JWT_SECRET
require_secret SECURITY_DB_ENCRYPTION_KEY
if [[ "${MODEL_PROVIDER:-OPENAI}" == "OPENAI" && "${SMOKE_USE_OPENAI_MOCK:-false}" != "true" ]]; then
    require_env_entry OPENAI_API_KEY
    require_secret OPENAI_API_KEY
fi
if (( ${#JWT_SECRET} < 32 )); then
    echo "[local] JWT_SECRET must contain at least 32 characters" >&2
    exit 1
fi
if (( ${#SECURITY_DB_ENCRYPTION_KEY} < 32 )); then
    echo "[local] SECURITY_DB_ENCRYPTION_KEY must contain at least 32 characters" >&2
    exit 1
fi

cd "${ROOT_DIR}"

echo "[local] starting postgres, redis, and python-service"
docker compose --env-file "${ENV_FILE}" up -d postgres redis python-service

if [[ "${START_LOCAL_WITH_MILVUS:-false}" == "true" ]]; then
    echo "[local] starting optional Milvus dependencies"
    docker compose --env-file "${ENV_FILE}" --profile milvus up -d etcd minio standalone
fi

wait_for() {
    local name="$1"
    local timeout="$2"
    shift 2
    local elapsed=0
    while (( elapsed < timeout )); do
        if "$@" >/dev/null 2>&1; then
            echo "[local] ${name} is ready"
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    echo "[local] timed out waiting for ${name}" >&2
    return 1
}

wait_for postgres 60 docker compose --env-file "${ENV_FILE}" exec -T postgres pg_isready \
    -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-ai_agent}"
if [[ -n "${REDIS_PASSWORD:-}" ]]; then
    export REDISCLI_AUTH="${REDIS_PASSWORD}"
    wait_for redis 60 docker compose --env-file "${ENV_FILE}" \
        exec -e REDISCLI_AUTH -T redis redis-cli ping
else
    wait_for redis 60 docker compose --env-file "${ENV_FILE}" exec -T redis redis-cli ping
fi
wait_for python-service 60 curl -fsS "http://127.0.0.1:${PYTHON_SERVICE_PORT:-8000}/health"

echo "[local] starting backend"
mvn --settings "${ROOT_DIR}/.mvn/settings.xml" -pl backend -am spring-boot:run &
BACKEND_PID=$!

cleanup() {
    if [[ -z "${BACKEND_PID:-}" ]]; then
        return 0
    fi
    if kill -0 "${BACKEND_PID}" 2>/dev/null; then
        kill -TERM "${BACKEND_PID}" 2>/dev/null || true
        while read -r child_pid; do
            [[ -n "${child_pid}" ]] || continue
            kill -TERM "${child_pid}" 2>/dev/null || true
        done < <(ps -axo pid=,ppid= | awk -v parent="${BACKEND_PID}" '$2 == parent { print $1 }')
        for _ in {1..10}; do
            kill -0 "${BACKEND_PID}" 2>/dev/null || break
            sleep 1
        done
        if kill -0 "${BACKEND_PID}" 2>/dev/null; then
            kill -KILL "${BACKEND_PID}" 2>/dev/null || true
        fi
        while read -r child_pid; do
            [[ -n "${child_pid}" ]] || continue
            kill -KILL "${child_pid}" 2>/dev/null || true
        done < <(ps -axo pid=,ppid= | awk -v parent="${BACKEND_PID}" '$2 == parent { print $1 }')
    fi
    wait "${BACKEND_PID}" 2>/dev/null || true
}

on_signal() {
    cleanup
    exit 0
}

trap cleanup EXIT
trap on_signal SIGINT SIGTERM

wait_for backend "${BACKEND_READY_TIMEOUT_SECONDS:-120}" curl -fsS \
    "http://127.0.0.1:${BACKEND_PORT:-8080}/api/v1/system/health/ready"
echo "[local] backend is ready; press Ctrl+C to stop it"
wait "${BACKEND_PID}"
