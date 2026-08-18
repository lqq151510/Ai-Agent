#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${HOME}/.ai-agent-desktop"

mkdir -p "${DATA_DIR}/db" "${DATA_DIR}/logs" "${DATA_DIR}/workspace"

echo "============================================================"
echo "🚀 AI Agent Desktop Standalone Mode (Zero Docker Dependency)"
echo "============================================================"
echo "📁 Data Directory: ${DATA_DIR}"
echo "🌐 Backend Port:   18080 (H2 + Caffeine + LangChain4j)"
echo "🤖 Model Endpoint: ${OPENAI_BASE_URL:-http://localhost:1234/v1}"
echo "============================================================"

# 环境变量设置
export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-desktop}"
export SERVER_PORT="${SERVER_PORT:-18080}"
export OPENAI_BASE_URL="${OPENAI_BASE_URL:-http://localhost:1234/v1}"
export OPENAI_MODEL="${OPENAI_MODEL:-qwen/qwen3.5-9b}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-sk-placeholder}"
export JWT_SECRET="${JWT_SECRET:-local-desktop-jwt-secret-key-32chars-min-auto}"
export SECURITY_DB_ENCRYPTION_KEY="${SECURITY_DB_ENCRYPTION_KEY:-local-desktop-db-encryption-key-32chars}"

BACKEND_PID=""

cleanup() {
    echo ""
    echo "[local] Stopping local services..."
    if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
        kill -TERM "${BACKEND_PID}" 2>/dev/null || true
        for _ in {1..5}; do
            kill -0 "${BACKEND_PID}" 2>/dev/null || break
            sleep 1
        done
        if kill -0 "${BACKEND_PID}" 2>/dev/null; then
            kill -KILL "${BACKEND_PID}" 2>/dev/null || true
        fi
    fi
    echo "[local] Stopped."
}

trap cleanup EXIT
trap 'cleanup; exit 0' SIGINT SIGTERM

echo "[local] Starting Spring Boot Backend (Profile: desktop)..."
cd "${ROOT_DIR}"
mvn -pl backend spring-boot:run -Dspring-boot.run.profiles="${SPRING_PROFILES_ACTIVE}" > "${DATA_DIR}/logs/backend-console.log" 2>&1 &
BACKEND_PID=$!

echo "[local] Waiting for backend liveness at http://127.0.0.1:${SERVER_PORT}/actuator/health/liveness..."
ELAPSED=0
TIMEOUT=60
READY=false
while (( ELAPSED < TIMEOUT )); do
    if curl -fsS "http://127.0.0.1:${SERVER_PORT}/actuator/health/liveness" >/dev/null 2>&1; then
        READY=true
        break
    fi
    if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
        echo "❌ Backend failed to start. Check logs at: ${DATA_DIR}/logs/backend-console.log" >&2
        exit 1
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

if [[ "${READY}" != "true" ]]; then
    echo "❌ Timeout waiting for backend readiness." >&2
    exit 1
fi

echo "✅ Backend is READY at http://127.0.0.1:${SERVER_PORT}"
echo "✨ You can now run Desktop App in another terminal: cd desktop && npm run dev"
echo "👉 Press Ctrl+C to stop the standalone backend service."

wait "${BACKEND_PID}"
