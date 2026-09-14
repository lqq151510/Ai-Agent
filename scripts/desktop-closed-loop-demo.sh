#!/usr/bin/env bash
# Knowledge Desk 完整数据闭环演示（隔离数据 + 打包运行时 + 重启持久化）
#
# 使用打包 .app 内与桌面端完全相同的后端二进制，配合独立的 KD_DATA_DIR，
# 验证：导入 -> 整理 -> 搜索 -> 复习 -> 停止 -> 以同一数据目录重启 -> 数据与状态仍存在。
#
# 全程不触碰真实用户数据（~/Library/Application Support/ai-agent-desktop）。
#
# 用法：
#   scripts/desktop-closed-loop-demo.sh [path/to/AI Agent.app]
#
# 环境变量：
#   DESKTOP_APP_PATH  未传第一个参数时使用的 .app 路径
#   PYTHON_BIN        执行流程断言的解释器（默认 python3，需 3.6+）
#   KD_DEMO_PORT      回环端口（默认 18120）
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-${DESKTOP_APP_PATH:-${REPO_ROOT}/desktop/release/python-arm64/mac-arm64/AI Agent.app}}"
BIN="${APP}/Contents/Resources/backend-python/knowledge-desk-backend/knowledge-desk-backend"
PY="${PYTHON_BIN:-python3}"
DATA_ROOT="$(mktemp -d /tmp/kd-demo.XXXXXX)"
DATA_DIR="${DATA_ROOT}/data"
PORT="${KD_DEMO_PORT:-18120}"
STATE="${DATA_ROOT}/phase1-state.json"

export NO_PROXY="127.0.0.1,localhost"
export no_proxy="127.0.0.1,localhost"
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy 2>/dev/null || true

BACKEND_PID=""

echo "========================================================"
echo " Knowledge Desk 闭环演示（隔离环境 / 打包运行时）"
echo "========================================================"
echo " 后端二进制   : ${BIN##*/}"
echo " 隔离数据目录 : ${DATA_DIR}"
echo " 回环端口     : ${PORT}"
echo "========================================================"

if [[ ! -x "${BIN}" ]]; then
  echo "FAIL 找不到可执行的后端二进制：${BIN}" >&2
  echo "提示：先执行 cd desktop && npm run build:python-backend，或传入打包 .app 路径。" >&2
  exit 1
fi

start_backend() {
  local phase="$1"
  KD_DATA_DIR="${DATA_DIR}" \
  KD_HOST=127.0.0.1 \
  KD_PORT="${PORT}" \
  KD_DESKTOP_MODE=true \
  KD_JWT_SECRET="kd-demo-jwt-secret-32-characters-minimum" \
  KD_DB_ENCRYPTION_KEY="kd-demo-encryption-key-material" \
  PYTHONUNBUFFERED=1 \
  PYTHONDONTWRITEBYTECODE=1 \
  "${BIN}" > "${DATA_ROOT}/backend-${phase}.log" 2>&1 &
  BACKEND_PID=$!
  echo ""
  echo "[启动] phase=${phase}  pid=${BACKEND_PID}"
}

wait_ready() {
  local code=""
  for _ in $(seq 1 80); do
    code="$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' \
      "http://127.0.0.1:${PORT}/api/v1/system/health/ready" 2>/dev/null || true)"
    [[ "${code}" == "200" ]] && return 0
    sleep 0.5
  done
  return 1
}

stop_backend() {
  if [[ -n "${BACKEND_PID}" ]]; then
    echo "[停止] pid=${BACKEND_PID}"
    kill "${BACKEND_PID}" 2>/dev/null || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
  BACKEND_PID=""
  sleep 2
}

cleanup() { stop_backend; }
trap cleanup EXIT

report_persistence() {
  local label="$1"
  local db="${DATA_DIR}/knowledge-desk.sqlite3"
  if [[ -f "${db}" ]]; then
    echo "[持久化] ${label}：SQLite 存在 $(stat -f '%z' "${db}" 2>/dev/null || stat -c '%s' "${db}") 字节"
  else
    echo "[持久化] ${label}：SQLite 不存在（异常）"
  fi
}

# ---------------------------------------------------------------- 阶段 1
start_backend "phase1"
if ! wait_ready; then
  echo "FAIL 阶段 1 后端未就绪；日志尾部：" >&2
  tail -20 "${DATA_ROOT}/backend-phase1.log" >&2
  exit 1
fi
echo "[就绪] $(curl -s --noproxy '*' "http://127.0.0.1:${PORT}/api/v1/system/health/ready")"
report_persistence "首次启动"

if ! "${PY}" - "${PORT}" "${STATE}" <<'PY'
import json, sys, urllib.error, urllib.request
from urllib.parse import quote

port, state_path = sys.argv[1], sys.argv[2]
base = f"http://127.0.0.1:{port}"
failures = []
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(f"{base}{path}", data=data, method=method)
    if body is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with opener.open(request, timeout=30) as response:
            payload = response.read().decode()
            return response.status, (json.loads(payload) if payload else {})
    except urllib.error.HTTPError as error:
        payload = error.read().decode()
        try:
            return error.code, json.loads(payload or "{}")
        except json.JSONDecodeError:
            return error.code, {"message": payload}


def check(label, condition, detail=""):
    print(f"  {'PASS' if condition else 'FAIL'}  {label}" + ("" if condition else f"   [{detail}]"))
    if not condition:
        failures.append(label)


CRED = {"email": "demo@knowledge.local", "password": "Desktop!demo2026Aa"}

print("\n【阶段 1】导入 -> 整理 -> 搜索 -> 复习")

status, _ = call("POST", "/api/v1/auth/register", CRED)
check("注册本地账号", status in (200, 409), f"status={status}")

status, tokens = call("POST", "/api/v1/auth/login", CRED)
check("登录并取得访问令牌", status == 200 and bool(tokens.get("accessToken")), f"status={status}")
token = tokens["accessToken"]

status, item = call("POST", "/api/v1/knowledge-items/import/snippet", {
    "title": "间隔重复学习法",
    "content": "间隔重复（Spaced Repetition）通过在不同时间点重复接触同一材料来对抗遗忘曲线。"
               "关键参数是复习间隔，典型做法是每次成功回忆后把间隔拉长。",
}, token)
check("导入文本片段 -> Inbox", status == 200 and item.get("status") == "inbox", f"status={status}")
item_id = item["id"]

status, _ = call("POST", "/api/v1/knowledge-items/import/web", {
    "url": "https://example.com/fsrs-scheduler",
    "content": "FSRS 用可记忆性、可提取性与难度三个变量建模记忆状态，并据此给出下一次复习时间。",
}, token)
check("导入网页资料", status == 200, f"status={status}")

status, page = call("GET", "/api/v1/knowledge-items?status=inbox&page=1&pageSize=20", token=token)
check("Inbox 列表可见刚导入的条目", status == 200 and page.get("total", 0) >= 2, f"total={page.get('total')}")

status, organized = call("POST", f"/api/v1/knowledge-items/{item_id}/organize", token=token)
check("整理条目（无模型时本地启发式）",
      status == 200 and organized.get("status") == "ready" and bool(organized.get("summary")),
      f"status={status}")
summary = organized.get("summary", "")

status, search = call("GET", f"/api/v1/knowledge-items/search?q={quote('间隔重复')}&page=1&pageSize=10", token=token)
hits = [i.get("id") for i in search.get("items", [])]
check("搜索命中刚导入的条目", status == 200 and item_id in hits, f"total={search.get('total')}")

status, queue_before = call("GET", "/api/v1/knowledge-reviews/queue?limit=10", token=token)
due_before = queue_before.get("dueCount", 0)
check("复习队列含到期条目", status == 200 and due_before >= 1, f"dueCount={due_before}")

status, reviewed = call("POST", f"/api/v1/knowledge-reviews/{item_id}/complete", {"rating": "good"}, token)
check("提交复习（rating=good）", status == 200 and reviewed.get("intervalDays") == 1, f"status={status}")

status, queue_after = call("GET", "/api/v1/knowledge-reviews/queue?limit=10", token=token)
due_after = queue_after.get("dueCount", 0)
check("复习后该条目移出到期队列", due_after < due_before, f"before={due_before} after={due_after}")

json.dump({
    "item_id": item_id,
    "summary": summary,
    "search_query": "间隔重复",
    "review_interval_days": reviewed.get("intervalDays"),
    "due_before": due_before,
    "due_after": due_after,
    "credentials": CRED,
}, open(state_path, "w"), ensure_ascii=False, indent=2)

if failures:
    print(f"\n阶段 1 失败项：{', '.join(failures)}")
    sys.exit(1)
print("\n阶段 1 通过")
PY
then
  echo "FAIL 阶段 1 未通过" >&2
  exit 1
fi

# ---------------------------------------------------------------- 重启
report_persistence "停止前"
echo ""
echo "========================================================"
echo " 停止后端（模拟用户退出应用）"
echo "========================================================"
stop_backend
if pgrep -f "backend-python/knowledge-desk-backend" >/dev/null 2>&1; then
  echo "[校验] 仍有后端进程残留（异常）"
else
  echo "[校验] 后端进程已完全退出"
fi

# ---------------------------------------------------------------- 阶段 2
start_backend "phase2"
if ! wait_ready; then
  echo "FAIL 阶段 2 后端未就绪；日志尾部：" >&2
  tail -20 "${DATA_ROOT}/backend-phase2.log" >&2
  exit 1
fi
echo "[就绪] $(curl -s --noproxy '*' "http://127.0.0.1:${PORT}/api/v1/system/health/ready")"
report_persistence "重启后"

if ! "${PY}" - "${PORT}" "${STATE}" <<'PY'
import json, sys, urllib.error, urllib.request
from urllib.parse import quote

port, state_path = sys.argv[1], sys.argv[2]
state = json.load(open(state_path))
base = f"http://127.0.0.1:{port}"
failures = []
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(f"{base}{path}", data=data, method=method)
    if body is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with opener.open(request, timeout=30) as response:
            payload = response.read().decode()
            return response.status, (json.loads(payload) if payload else {})
    except urllib.error.HTTPError as error:
        payload = error.read().decode()
        try:
            return error.code, json.loads(payload or "{}")
        except json.JSONDecodeError:
            return error.code, {"message": payload}


def check(label, condition, detail=""):
    print(f"  {'PASS' if condition else 'FAIL'}  {label}" + ("" if condition else f"   [{detail}]"))
    if not condition:
        failures.append(label)


print("\n【阶段 2】重启后持久化验证")

status, tokens = call("POST", "/api/v1/auth/login", state["credentials"])
check("重启后原账号可登录（用户数据持久化）",
      status == 200 and bool(tokens.get("accessToken")), f"status={status}")
token = tokens["accessToken"]

status, item = call("GET", f"/api/v1/knowledge-items/{state['item_id']}", token=token)
check("重启后条目仍存在（同一 id）",
      status == 200 and item.get("id") == state["item_id"], f"status={status}")
check("重启后整理结果保留（summary 与停止前一致）",
      item.get("summary") == state["summary"], f"summary={str(item.get('summary'))[:40]}")

status, search = call("GET", f"/api/v1/knowledge-items/search?q={quote(state['search_query'])}&page=1&pageSize=10", token=token)
hits = [i.get("id") for i in search.get("items", [])]
check("重启后搜索仍命中", status == 200 and state["item_id"] in hits, f"total={search.get('total')}")

status, queue = call("GET", "/api/v1/knowledge-reviews/queue?limit=10", token=token)
due_now = queue.get("dueCount", 0)
check("重启后复习状态保留（到期数维持复习后的值）",
      status == 200 and due_now == state["due_after"], f"now={due_now} expected={state['due_after']}")

status, ready_page = call("GET", "/api/v1/knowledge-items?status=ready&page=1&pageSize=20", token=token)
ids = [i.get("id") for i in ready_page.get("items", [])]
check("重启后 Library（ready）仍含该条目",
      status == 200 and state["item_id"] in ids, f"total={ready_page.get('total')}")

status, jobs = call("GET", f"/api/v1/ingestion-jobs?knowledgeItemId={state['item_id']}&limit=20", token=token)
check("重启后导入/整理任务流水仍可回溯", status == 200 and len(jobs) >= 2, f"count={len(jobs)}")

if failures:
    print(f"\n阶段 2 失败项：{', '.join(failures)}")
    sys.exit(1)
print("\n阶段 2 通过")
PY
then
  echo "FAIL 阶段 2 未通过" >&2
  exit 1
fi

echo ""
echo "========================================================"
echo " 结果：导入 -> 整理 -> 搜索 -> 复习 -> 重启后仍存在  全部通过"
echo "========================================================"
echo " 隔离数据目录 : ${DATA_DIR}"
echo " 后端日志     : ${DATA_ROOT}/backend-phase1.log, backend-phase2.log"
echo " 阶段状态快照 : ${STATE}"
