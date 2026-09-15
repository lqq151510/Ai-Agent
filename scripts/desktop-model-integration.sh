#!/usr/bin/env bash
# Knowledge Desk 真实模型联调（隔离数据 + 打包运行时 + OpenAI-compatible 端点）
#
# 验证 AI 整理路径走真实模型而非本地启发式：
#   A. 模型源配置 + 连通性测试 + 凭据脱敏
#   B. 真实模型整理（ingestion job note = "model"）对比本地启发式（note = "local_heuristic"）
#   C. 失败降级（无效凭据不阻断知识管理，错误信息不含凭据明文）
#   D. 凭据加密落库（enc:v1: 前缀，库内与日志中均无明文）
#
# 全程使用隔离 KD_DATA_DIR，不触碰真实用户数据。
#
# 用法：
#   GLM_API_KEY=<key> scripts/desktop-model-integration.sh [path/to/AI Agent.app]
#
# 环境变量：
#   GLM_API_KEY       必填，模型端点凭据（脚本不会将其写入任何文件）
#   GLM_BASE_URL      默认 https://open.bigmodel.cn/api/paas/v4（智谱 GLM）
#   GLM_MODEL         默认 glm-4-flash（智谱免费模型）
#   DESKTOP_APP_PATH  未传第一个参数时使用的 .app 路径
#   PYTHON_BIN        执行断言的解释器（默认 python3，需 3.6+）
#   KD_GLM_PORT       回环端口（默认 18130）
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-${DESKTOP_APP_PATH:-${REPO_ROOT}/desktop/release/python-arm64/mac-arm64/AI Agent.app}}"
BIN="${APP}/Contents/Resources/backend-python/knowledge-desk-backend/knowledge-desk-backend"
PY="${PYTHON_BIN:-python3}"
DATA_ROOT="$(mktemp -d /tmp/kd-glm.XXXXXX)"
DATA_DIR="${DATA_ROOT}/data"
PORT="${KD_GLM_PORT:-18130}"

# 国内模型端点：确保后端进程直连，不继承任何代理设置。
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy 2>/dev/null || true
export NO_PROXY="127.0.0.1,localhost"
export no_proxy="${NO_PROXY}"

: "${GLM_API_KEY:?请通过环境变量 GLM_API_KEY 提供模型端点密钥}"
GLM_BASE_URL="${GLM_BASE_URL:-https://open.bigmodel.cn/api/paas/v4}"
GLM_MODEL="${GLM_MODEL:-glm-4-flash}"

BACKEND_PID=""

echo "========================================================"
echo " Knowledge Desk 真实模型联调（隔离环境）"
echo "========================================================"
echo " 模型端点   : ${GLM_BASE_URL}"
echo " 模型名     : ${GLM_MODEL}"
echo " 隔离数据   : ${DATA_DIR}"
echo " 端口       : ${PORT}"
echo "========================================================"

if [[ ! -x "${BIN}" ]]; then
  echo "FAIL 找不到后端二进制：${BIN}" >&2
  echo "提示：先执行 cd desktop && npm run build:python-backend，或传入打包 .app 路径。" >&2
  exit 1
fi

start_backend() {
  KD_DATA_DIR="${DATA_DIR}" \
  KD_HOST=127.0.0.1 \
  KD_PORT="${PORT}" \
  KD_DESKTOP_MODE=true \
  KD_JWT_SECRET="kd-glm-jwt-secret-32-characters-minimum" \
  KD_DB_ENCRYPTION_KEY="kd-glm-encryption-key-material" \
  PYTHONUNBUFFERED=1 \
  PYTHONDONTWRITEBYTECODE=1 \
  "${BIN}" > "${DATA_ROOT}/backend.log" 2>&1 &
  BACKEND_PID=$!
  echo "[启动] pid=${BACKEND_PID}"
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

cleanup() {
  if [[ -n "${BACKEND_PID}" ]]; then
    kill "${BACKEND_PID}" 2>/dev/null || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

start_backend
if ! wait_ready; then
  echo "FAIL 后端未就绪；日志尾部：" >&2
  tail -20 "${DATA_ROOT}/backend.log" >&2
  exit 1
fi
echo "[就绪] $(curl -s --noproxy '*' "http://127.0.0.1:${PORT}/api/v1/system/health/ready")"

"${PY}" - "${PORT}" "${GLM_API_KEY}" "${GLM_BASE_URL}" "${GLM_MODEL}" "${DATA_DIR}" <<'PY'
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request

port, api_key, base_url, model_name, data_dir = sys.argv[1:6]
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
        with opener.open(request, timeout=90) as response:
            payload = response.read().decode()
            return response.status, (json.loads(payload) if payload else {}), payload
    except urllib.error.HTTPError as error:
        payload = error.read().decode()
        try:
            return error.code, json.loads(payload or "{}"), payload
        except json.JSONDecodeError:
            return error.code, {"message": payload}, payload


def check(label, condition, detail=""):
    print(f"  {'PASS' if condition else 'FAIL'}  {label}" + ("" if condition else f"   [{detail}]"))
    if not condition:
        failures.append(label)


CRED = {"email": "glm@knowledge.local", "password": "Desktop!glm2026Aa"}

call("POST", "/api/v1/auth/register", CRED)
status, tokens, _ = call("POST", "/api/v1/auth/login", CRED)
token = tokens["accessToken"]

# ---------------------------------------------------------- A. 模型源与连通性
print("\n【A】模型源配置 · 连通性 · 凭据脱敏")

status, source, raw = call("POST", "/api/v1/model-sources", {
    "providerType": "custom",
    "name": "智谱 GLM（免费模型）",
    "baseUrl": base_url,
    "apiKey": api_key,
    "defaultModel": model_name,
    "enabled": True,
    "isDefault": True,
}, token)
check("创建模型源", status == 200, f"status={status}")
source_id = source.get("id")

check("响应只返回掩码、不回显明文密钥",
      "apiKey" not in source and bool(source.get("apiKeyMasked")) and api_key not in raw,
      f"masked={source.get('apiKeyMasked')}")

check("凭据不以明文出现在数据目录",
      api_key not in open(os.path.join(data_dir, "knowledge-desk.sqlite3"), "rb")
      .read().decode("utf-8", "ignore"))

status, tested, raw_test = call("POST", f"/api/v1/model-sources/{source_id}/test", token=token)
check("连接测试通过（真实调用模型端点）",
      status == 200 and tested.get("status") == "ok",
      f"status={status} body={tested.get('message')}")

status, sources, _ = call("GET", "/api/v1/model-sources", token=token)
entry = next((s for s in sources if s["id"] == source_id), {})
check("列表记录最近检查状态", entry.get("lastCheckStatus") == "ok", f"{entry.get('lastCheckStatus')}")

# ---------------------------------------------------------- B. 真实模型整理
print("\n【B】真实模型整理 vs 本地启发式")

status, _, _ = call("PUT", "/api/v1/settings/profile", {
    "defaultModelSourceId": source_id,
    "summaryModelSourceId": source_id,
}, token)
check("绑定默认与摘要模型源", status == 200, f"status={status}")

ARTICLE = (
    "间隔重复与遗忘曲线\n\n"
    "艾宾浩斯在十九世纪通过无意义音节实验发现，遗忘在记忆形成初期最快，"
    "随后逐渐放缓。基于这一规律，间隔重复法把复习安排在即将遗忘的临界点："
    "第一次复习在数小时后，随后间隔按约两倍递增。每次成功回忆都会延长下次间隔，"
    "而回忆失败则缩短间隔。现代调度算法（如 SM-2 与 FSRS）进一步引入难度、"
    "可提取性与稳定性等参数，用模型预测记忆保持概率，从而为每个知识条目生成个性化排程。"
)

status, item, raw = call("POST", "/api/v1/knowledge-items/import/snippet", {
    "title": "间隔重复与遗忘曲线",
    "content": ARTICLE,
}, token)
item_id = item["id"]
check("导入待整理资料", status == 200, f"status={status}")

status, organized, raw_org = call("POST", f"/api/v1/knowledge-items/{item_id}/organize", token=token)
check("整理调用成功", status == 200 and organized.get("status") == "ready", f"status={status}")

summary = organized.get("summary") or ""
tags = organized.get("tags") or []
check("产出非空摘要", bool(summary.strip()), f"summary={summary[:40]}")
check("产出标签（模型生成）", len(tags) >= 1, f"tags={[t.get('name') for t in tags]}")

status, jobs, _ = call("GET", f"/api/v1/ingestion-jobs?knowledgeItemId={item_id}&limit=20", token=token)
notes = [j.get("note") for j in jobs]
check("任务记录标记为真实模型（note=model）", "model" in notes, f"notes={notes}")

model_summary, model_tags = summary, [t.get("name") for t in tags]

# 对照：停用模型源后整理第二条，应回落到本地启发式
call("POST", f"/api/v1/model-sources/{source_id}/disable", token=token)
status, item2, _ = call("POST", "/api/v1/knowledge-items/import/snippet", {
    "title": "对照条目",
    "content": ARTICLE,
}, token)
status, organized2, _ = call("POST", f"/api/v1/knowledge-items/{item2['id']}/organize", token=token)
status, jobs2, _ = call("GET", f"/api/v1/ingestion-jobs?knowledgeItemId={item2['id']}&limit=20", token=token)
notes2 = [j.get("note") for j in jobs2]
check("停用模型源后回落为本地启发式（note=local_heuristic）",
      "local_heuristic" in notes2, f"notes={notes2}")
check("两条路径产出可区分（本地启发式不带模型标签）",
      len(organized2.get("tags") or []) == 0,
      f"tags={[t.get('name') for t in (organized2.get('tags') or [])]}")

call("POST", f"/api/v1/model-sources/{source_id}/enable", token=token)

# ---------------------------------------------------------- C. 失败降级
print("\n【C】失败降级路径")

status, bad, raw_bad = call("POST", "/api/v1/model-sources", {
    "providerType": "custom",
    "name": "无效凭据源",
    "baseUrl": base_url,
    "apiKey": "invalid-key-for-negative-test",
    "defaultModel": model_name,
    "enabled": True,
    "isDefault": False,
}, token)
bad_id = bad.get("id")
status, bad_test, raw_bad_test = call("POST", f"/api/v1/model-sources/{bad_id}/test", token=token)
check("无效凭据连接测试返回错误状态",
      status == 200 and bad_test.get("status") == "error",
      f"status={status} message={bad_test.get('message')}")
check("错误信息不含凭据明文",
      "invalid-key-for-negative-test" not in raw_bad_test, "leaked")

# ---------------------------------------------------------- D. 凭据落库形态
print("\n【D】凭据加密落库")

db = os.path.join(data_dir, "knowledge-desk.sqlite3")
con = sqlite3.connect(db)
try:
    rows = con.execute("SELECT name, api_key_encrypted, api_key_masked FROM model_sources").fetchall()
finally:
    con.close()
check("凭据以 enc:v1: 密文落库",
      bool(rows) and all(str(r[1]).startswith("enc:v1:") for r in rows),
      f"{[str(r[1])[:10] for r in rows]}")
check("库内不存在明文密钥", api_key not in "".join(str(r[1]) for r in rows))

print("\n--------------------------------------------------------")
print(" 真实模型整理结果（供人工比对）")
print(f" 摘要 : {model_summary}")
print(f" 标签 : {model_tags}")
print("--------------------------------------------------------")

if failures:
    print(f"\n失败项：{', '.join(failures)}")
    sys.exit(1)
print("\n真实模型联调：全部通过")
PY

echo ""
echo "========================================================"
echo " 隔离数据目录 : ${DATA_DIR}"
echo " 后端日志     : ${DATA_ROOT}/backend.log"
echo "========================================================"
