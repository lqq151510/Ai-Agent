#!/usr/bin/env bash
# ==============================================================================
# AI Agent Knowledge Desk - macOS 极速全栈一键启动脚本 (云端模型模式)
# 适用平台: macOS (Apple Silicon M 系列 / Intel x86_64)
# 功能: 智能环境自检 -> 端口释放 -> 后端拉起 (H2+Caffeine) -> 桌面端联动 -> 优雅退出
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${HOME}/.ai-agent-desktop"
BACKEND_PORT="${SERVER_PORT:-18080}"

# 颜色与输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[macOS 闭环]${NC} $1"; }
log_succ() { echo -e "${GREEN}[macOS 闭环]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[macOS 闭环]${NC} $1"; }
log_err()  { echo -e "${RED}[macOS 闭环]${NC} $1" >&2; }

echo ""
echo -e "${PURPLE}================================================================${NC}"
echo -e "${PURPLE}   🤖 AI Agent Knowledge Desk - macOS Cloud-Model 启动器       ${NC}"
echo -e "${PURPLE}================================================================${NC}"
echo ""

# 1. 硬件与系统信息检测
ARCH="$(uname -m)"
OS_VER="$(sw_vers -productVersion 2>/dev/null || echo 'Unknown')"
TOTAL_MEM="$(sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024/1024/1024)"GB"}' || echo 'Unknown')"
log_info "系统硬件: macOS ${OS_VER} (${ARCH}) | 物理内存: ${TOTAL_MEM}"

# 2. 运行时依赖检测 (Java 21 & Node.js)
if ! command -v java &>/dev/null; then
    log_err "未找到 Java 命令，请先安装 JDK 21 (如: brew install openjdk@21)"
    exit 1
fi
JAVA_VER=$(java -version 2>&1 | head -n 1)
log_succ "Java 运行时: ${JAVA_VER}"

if ! command -v node &>/dev/null; then
    log_err "未找到 Node 命令，请先安装 Node.js 22 (如: brew install node@22 或使用 nvm)"
    exit 1
fi
NODE_VER=$(node -v)
log_succ "Node.js 运行时: ${NODE_VER}"

log_succ "仅启用云端模型；未配置有效云端 API Key 时，AI 整理会明确失败，不生成规则标签。"

# 3. 端口检查与释放
release_port() {
    local port="$1"
    local pids
    pids=$(lsof -ti tcp:"${port}" 2>/dev/null || true)
    if [[ -n "${pids}" ]]; then
        log_warn "端口 ${port} 被占用，正在释放 (PID: ${pids})..."
        kill -9 ${pids} 2>/dev/null || true
        sleep 1
    fi
}
release_port "${BACKEND_PORT}"

# 4. 初始化本地数据目录
mkdir -p "${DATA_DIR}/db" "${DATA_DIR}/logs" "${DATA_DIR}/workspace"

# 5. 配置环境变量 (云端模型桌面 Profile，优先从 .env 读取配置)
if [[ -f "${ROOT_DIR}/.env" ]]; then
    set -a
    source "${ROOT_DIR}/.env"
    set +a
fi

export SPRING_PROFILES_ACTIVE="desktop"
export SERVER_PORT="${BACKEND_PORT}"
export AI_REQUIRE_CLOUD_MODEL="${AI_REQUIRE_CLOUD_MODEL:-true}"
export OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://api.openai.com/v1}"
export OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
export JWT_SECRET="${JWT_SECRET:-local-desktop-jwt-secret-key-32chars-min-auto}"
export SECURITY_DB_ENCRYPTION_KEY="${SECURITY_DB_ENCRYPTION_KEY:-local-desktop-db-encryption-key-32chars}"

BACKEND_PID=""
FRONTEND_PID=""
RENDERER_PID=""

find_renderer_port() {
    local port="${DESKTOP_RENDERER_PORT:-5173}"
    if [[ -n "${DESKTOP_RENDERER_PORT:-}" ]]; then
        echo "${port}"
        return
    fi
    while lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; do
        port=$((port + 1))
    done
    echo "${port}"
}

cleanup() {
    echo ""
    log_info "正在安全停止 macOS 本地服务..."
    if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
        kill -TERM "${BACKEND_PID}" 2>/dev/null || true
    fi
    if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
        kill -TERM "${FRONTEND_PID}" 2>/dev/null || true
    fi
    if [[ -n "${RENDERER_PID}" ]] && kill -0 "${RENDERER_PID}" 2>/dev/null; then
        kill -TERM "${RENDERER_PID}" 2>/dev/null || true
    fi
    sleep 1
    log_succ "macOS 本地服务已安全退出。"
}

trap cleanup EXIT
trap 'cleanup; exit 0' SIGINT SIGTERM

# 6. 确保本地 Starter 模块就绪并启动 Spring Boot 后端
log_info "正在启动 Spring Boot Desktop 后端 (嵌入式 H2 + 云端 Embedding + 本地向量索引)..."
cd "${ROOT_DIR}"
mvn -pl bug-sentinel-starter install -DskipTests -q
mvn -pl backend spring-boot:run -Dspring-boot.run.profiles=desktop > "${DATA_DIR}/logs/backend-console.log" 2>&1 &
BACKEND_PID=$!

log_info "等待后端健康检查就绪 (http://127.0.0.1:${BACKEND_PORT}/actuator/health/liveness)..."
ELAPSED=0
TIMEOUT=60
READY=false

while (( ELAPSED < TIMEOUT )); do
    if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/actuator/health/liveness" >/dev/null 2>&1; then
        READY=true
        break
    fi
    if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
        log_err "后端启动异常，请查看日志: ${DATA_DIR}/logs/backend-console.log"
        exit 1
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

if [[ "${READY}" != "true" ]]; then
    log_err "后端启动超时 (60s)"
    exit 1
fi

log_succ "✅ 后端就绪完成！(PID: ${BACKEND_PID})"

# 7. 启动桌面端应用 (Electron + Vue 3)
log_info "正在启动桌面端客户端 (Electron + Vue 3)..."
cd "${ROOT_DIR}/desktop"

if [[ ! -d "node_modules" ]]; then
    log_info "安装桌面端依赖..."
    npm ci --no-audit --no-fund
fi

# 开发模式下同时启动 Vue 3 Vite 服务；如果默认端口被其他应用占用则顺延到空闲端口。
RENDERER_PORT="$(find_renderer_port)"
log_info "正在启动 Vue 3 渲染器 (http://127.0.0.1:${RENDERER_PORT})..."
npm --prefix "${ROOT_DIR}/desktop/src/renderer-vue" run dev -- --host 127.0.0.1 --port "${RENDERER_PORT}" \
    > "${DATA_DIR}/logs/renderer-console.log" 2>&1 &
RENDERER_PID=$!

RENDERER_READY=false
ELAPSED=0
while (( ELAPSED < 30 )); do
    if curl -fsS "http://127.0.0.1:${RENDERER_PORT}/" >/dev/null 2>&1; then
        RENDERER_READY=true
        break
    fi
    if ! kill -0 "${RENDERER_PID}" 2>/dev/null; then
        log_err "Vue 3 渲染器启动异常，请查看日志: ${DATA_DIR}/logs/renderer-console.log"
        exit 1
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done

if [[ "${RENDERER_READY}" != "true" ]]; then
    log_err "Vue 3 渲染器启动超时 (30s)"
    exit 1
fi

# 启动 Electron，并显式绑定本次自动选择的 Vue 3 端口。
DESKTOP_BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}" \
DESKTOP_RENDERER_URL="http://127.0.0.1:${RENDERER_PORT}" npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  🎉 AI Agent Knowledge Desk 已在 macOS 上成功启动！           ${NC}"
echo -e "${GREEN}  🌐 后端地址: http://127.0.0.1:${BACKEND_PORT}                      ${NC}"
echo -e "${GREEN}  🖥️  Vue 3 地址: http://127.0.0.1:${RENDERER_PORT}                       ${NC}"
echo -e "${GREEN}  💾 本地存储: ${DATA_DIR}                                     ${NC}"
echo -e "${GREEN}  ✨ 模式: 仅真实云端模型 (云端整理/Embedding + 本地索引)       ${NC}"
echo -e "${GREEN}  ⌨️  随时在终端按 Ctrl+C 可一键停止全部服务                     ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""

wait "${FRONTEND_PID}"
