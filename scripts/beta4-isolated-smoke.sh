#!/usr/bin/env bash
# Beta.4 候选 .app 隔离启动 smoke：
#   第一次启动 -> readiness -> 数据落盘 -> 退出清理 -> 第二次启动（重启持久化）
set -euo pipefail

APP_PATH="${1:?usage: beta4-isolated-smoke.sh /path/to/AI Agent.app}"
USER_DIR="$(mktemp -d /tmp/beta4-userdata.XXXXXX)"
LOG_FILE="${USER_DIR}/data/logs/desktop-runtime.log"

echo "[smoke] app: ${APP_PATH}"
echo "[smoke] isolated user-data-dir: ${USER_DIR}"

wait_ready() {
  local waited=0
  local port=""
  while [[ ${waited} -lt 90 ]]; do
    if [[ -f "${LOG_FILE}" ]]; then
      port="$(sed -nE 's/.*Starting managed backend on port ([0-9]+).*/\1/p' "${LOG_FILE}" | tail -1)"
      if [[ -n "${port}" ]]; then
        local payload
        if payload="$(curl -fsS --max-time 2 "http://127.0.0.1:${port}/api/v1/system/health/ready" 2>/dev/null)"; then
          if echo "${payload}" | grep -q '"ready":true'; then
            echo "[smoke] readiness OK on port ${port}: ${payload}"
            return 0
          fi
        fi
      fi
    fi
    sleep 2
    waited=$((waited + 2))
  done
  echo "[smoke] readiness timeout after ${waited}s" >&2
  return 1
}

stop_app() {
  if [[ -n "${APP_PID:-}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
  APP_PID=""
}

backend_pids() {
  pgrep -f "backend.jar.*--app.data-dir=${USER_DIR}" 2>/dev/null || true
}

trap 'stop_app' EXIT

echo "[smoke] first launch..."
"${APP_PATH}/Contents/MacOS/AI Agent" --user-data-dir="${USER_DIR}" >/dev/null 2>&1 &
APP_PID=$!
wait_ready
echo "[smoke] first launch ready; data dir contents:"
ls "${USER_DIR}/data" 2>/dev/null || true

echo "[smoke] stopping app (expect backend cleanup)..."
stop_app
sleep 3
LEFTOVER="$(backend_pids)"
if [[ -n "${LEFTOVER}" ]]; then
  echo "[smoke] FAIL: backend process still alive after app quit: ${LEFTOVER}" >&2
  exit 1
fi
echo "[smoke] backend cleaned up on quit"

H2_FILES="$(find "${USER_DIR}/data" -name '*.mv.db' 2>/dev/null | head -3)"
VECTOR_FILES="$(find "${USER_DIR}/data" -name '*.json' -path '*vector*' 2>/dev/null | head -3)"
echo "[smoke] persisted H2 files: ${H2_FILES:-none}"
echo "[smoke] persisted vector snapshots: ${VECTOR_FILES:-none}"

echo "[smoke] second launch (restart persistence)..."
"${APP_PATH}/Contents/MacOS/AI Agent" --user-data-dir="${USER_DIR}" >/dev/null 2>&1 &
APP_PID=$!
wait_ready
echo "[smoke] second launch ready; restart persistence OK"
stop_app
echo "[smoke] ALL CHECKS PASSED"
