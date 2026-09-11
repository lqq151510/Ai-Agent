#!/usr/bin/env bash
# Local smoke test for the Knowledge Desk FastAPI backend.
#
# Starts the backend on a throwaway data directory, then drives the MVP closed
# loop over HTTP exactly the way the desktop does (Bearer token, camelCase
# payloads) and prints a PASS/FAIL line per step.
#
# Usage: ./scripts/smoke-local.sh [port]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${KD_SMOKE_DATA_DIR:-$ROOT_DIR/.smoke-data}"
PORT="${1:-${KD_SMOKE_PORT:-18099}}"

rm -rf "$DATA_DIR"
mkdir -p "$DATA_DIR"

export KD_DATA_DIR="$DATA_DIR"
export KD_PORT="$PORT"
export KD_DESKTOP_MODE="true"
export KD_JWT_SECRET="smoke-test-jwt-secret-value-at-least-32"
export KD_DB_ENCRYPTION_KEY="smoke-test-encryption-key"
export KD_LOG_LEVEL="WARNING"

cd "$ROOT_DIR"

uv run python -m knowledge_desk.main &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

HEALTH_URL="http://127.0.0.1:${PORT}/api/v1/system/health/ready"

echo "== waiting for readiness on ${HEALTH_URL}"
READY_CODE=""
for _ in $(seq 1 80); do
  READY_CODE="$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)"
  if [ "$READY_CODE" = "200" ]; then
    break
  fi
  sleep 0.5
done

if [ "$READY_CODE" != "200" ]; then
  echo "FAIL readiness returned ${READY_CODE:-no-response}"
  exit 1
fi
echo "PASS readiness 200"

curl -s --noproxy '*' "$HEALTH_URL" | head -c 400
echo

uv run python - "$PORT" <<'PY'
import json
import sys
import urllib.error
import urllib.request
from urllib.parse import quote

port = sys.argv[1]
base = f"http://127.0.0.1:{port}"
failures: list[str] = []


def call(method: str, path: str, body=None, token: str | None = None, raw: bool = False):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(f"{base}{path}", data=data, method=method)
    if body is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read().decode()
            return response.status, (payload if raw else json.loads(payload or "{}"))
    except urllib.error.HTTPError as error:
        payload = error.read().decode()
        try:
            return error.code, json.loads(payload or "{}")
        except json.JSONDecodeError:
            return error.code, {"message": payload}


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"PASS {label}")
    else:
        print(f"FAIL {label} {detail}")
        failures.append(label)


CREDENTIALS = {"email": "smoke@example.com", "password": "Desktop!smoke1234Aa"}

status, _ = call("POST", "/api/v1/auth/register", CREDENTIALS)
check("register", status == 200, f"status={status}")

status, tokens = call("POST", "/api/v1/auth/login", CREDENTIALS)
check("login", status == 200 and bool(tokens.get("accessToken")), f"status={status}")
token = tokens["accessToken"]

status, item = call(
    "POST",
    "/api/v1/knowledge-items/import/snippet",
    {
        "title": "冒烟验证资料",
        "content": (
            "Knowledge Desk 的冒烟验证资料。\n\n"
            "本段文字用于验证导入、整理、搜索、复习、归档与备份恢复闭环。"
        ),
    },
    token,
)
check("import snippet", status == 200 and item.get("status") == "inbox", f"status={status}")
item_id = item["id"]

status, page = call("GET", "/api/v1/knowledge-items?status=inbox&page=1&pageSize=20", token=token)
check("list inbox", status == 200 and page.get("total", 0) >= 1, f"status={status}")

status, organized = call("POST", f"/api/v1/knowledge-items/{item_id}/organize", token=token)
check(
    "organize (local heuristic)",
    status == 200 and organized.get("status") == "ready" and bool(organized.get("summary")),
    f"status={status}",
)

status, search = call(
    "GET",
    f"/api/v1/knowledge-items/search?q={quote('冒烟验证')}&page=1&pageSize=10",
    token=token,
)
check("search", status == 200 and search.get("total", 0) >= 1, f"status={status}")

status, jobs = call("GET", f"/api/v1/ingestion-jobs?knowledgeItemId={item_id}&limit=20", token=token)
check("ingestion jobs", status == 200 and len(jobs) >= 2, f"status={status} count={len(jobs)}")

status, review_queue = call("GET", "/api/v1/knowledge-reviews/queue?limit=10", token=token)
check("review queue", status == 200 and review_queue.get("dueCount", 0) >= 1, f"status={status}")

status, review_state = call(
    "POST", f"/api/v1/knowledge-reviews/{item_id}/complete", {"rating": "good"}, token
)
check(
    "review complete",
    status == 200 and review_state.get("intervalDays") == 1,
    f"status={status}",
)

status, archived = call("POST", f"/api/v1/knowledge-items/{item_id}/archive", token=token)
check("archive", status == 200 and archived.get("status") == "archived", f"status={status}")

status, restored = call("POST", f"/api/v1/knowledge-items/{item_id}/restore", token=token)
check("restore", status == 200 and restored.get("status") == "ready", f"status={status}")

status, backup = call("GET", "/api/v1/settings/export", token=token)
check(
    "export backup",
    status == 200
    and backup.get("schemaVersion") == 1
    and backup.get("modelSourcesIncluded") is False
    and len(backup.get("knowledgeItems", [])) >= 1,
    f"status={status}",
)
check("export keeps credentials out", "apiKey" not in json.dumps(backup))

second = {"email": "smoke-second@example.com", "password": "Desktop!smoke5678Bb"}
status, register_second = call("POST", "/api/v1/auth/register", second)
check("register second account", status == 200, f"status={status}")
status, second_tokens = call("POST", "/api/v1/auth/login", second)
second_token = second_tokens["accessToken"]

status, restored_backup = call("POST", "/api/v1/settings/import", backup, second_token)
check(
    "import backup",
    status == 200 and restored_backup.get("importedItems", 0) >= 1,
    f"status={status} body={restored_backup}",
)

status, unauthorized = call("GET", "/api/v1/knowledge-items")
check(
    "unauthenticated request rejected",
    status == 401 and "code" in unauthorized,
    f"status={status}",
)

status, invalid = call(
    "POST",
    "/api/v1/knowledge-items/import/web",
    {"url": "ftp://not-a-web-url", "content": "内容"},
    token,
)
check(
    "invalid payload rejected",
    status == 400 and invalid.get("code"),
    f"status={status}",
)

status, missing = call("GET", f"/api/v1/knowledge-items/{item_id}", token=token)
check("resource still readable after errors", status == 200, f"status={status}")

if failures:
    print(f"\nSMOKE FAILED: {len(failures)} step(s) -> {', '.join(failures)}")
    raise SystemExit(1)

print("\nSMOKE PASSED: import -> inbox -> organize -> search -> review -> archive/restore -> backup/restore")
PY
