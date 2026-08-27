#!/usr/bin/env bash
# ============================================================================
# AI Agent Desktop - 开发诊断构建脚本
# ----------------------------------------------------------------------------
# 用法：
#   ./scripts/build-all.sh [--mac|--win|--linux] [--skip-backend] [--skip-renderer]
#   ./scripts/build-all.sh --release [--mac]
#
# 功能：
#   1. 检查构建依赖（node / java / maven / jlink）
#   2. 构建后端 JAR（backend，desktop profile）、TS CLI、Local Service
#   3. 使用 jlink 生成最小化 JRE
#   4. 构建 Desktop Renderer 并复制到 desktop/dist/renderer
#   5. 编译 Electron 主进程（tsc）
#   6. 调用 electron-builder 打包
#
# macOS 发行：
#   默认路径只生成开发诊断产物，不能作为可交付安装包。
#   --release 委托给仓库根目录的 scripts/release-check-macos.sh，强制
#   签名、公证、Gatekeeper、精确 tag 和干净源码门禁。
#
# 其他环境变量：
#   DESKTOP_SKIP_NPM_INSTALL=true  - 跳过 npm install
#   DESKTOP_VITE_API_BASE          - Renderer API 基址（默认 http://localhost:18080）
#   DESKTOP_BACKEND_MVN_ARGS       - 额外 Maven 参数
#   DESKTOP_ELECTRON_BUILDER_ARGS  - 额外 electron-builder 参数
# ============================================================================
set -euo pipefail

# ----------------------------------------------------------------------------
# 路径与默认值
# ----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${DESKTOP_DEV_OUTPUT_DIR:-$DESKTOP_DIR/release-dev/$(date +%Y%m%d-%H%M%S)}"

SKIP_INSTALL="${DESKTOP_SKIP_NPM_INSTALL:-false}"
WEB_API_BASE="${DESKTOP_VITE_API_BASE:-http://localhost:18080}"
BUILDER_ARGS="${DESKTOP_ELECTRON_BUILDER_ARGS:-}"
SKIP_BACKEND="false"
SKIP_RENDERER="false"
TARGET_PLATFORM=""
RELEASE_BUILD="false"

# 颜色输出（如终端不支持会降级）
if [[ -t 1 ]]; then
    COLOR_RED='\033[0;31m'
    COLOR_GREEN='\033[0;32m'
    COLOR_YELLOW='\033[1;33m'
    COLOR_BLUE='\033[0;34m'
    COLOR_NC='\033[0m'
else
    COLOR_RED=''; COLOR_GREEN=''; COLOR_YELLOW=''; COLOR_BLUE=''; COLOR_NC=''
fi

log_info()  { echo -e "${COLOR_BLUE}[INFO]${COLOR_NC} $*"; }
log_ok()    { echo -e "${COLOR_GREEN}[OK]${COLOR_NC} $*"; }
log_warn()  { echo -e "${COLOR_YELLOW}[WARN]${COLOR_NC} $*"; }
log_error() { echo -e "${COLOR_RED}[ERROR]${COLOR_NC} $*" >&2; }
log_step()  { echo -e "\n${COLOR_BLUE}=== $* ===${COLOR_NC}"; }

# ----------------------------------------------------------------------------
# 参数解析
# ----------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --mac)
            TARGET_PLATFORM="mac"
            shift
            ;;
        --win)
            TARGET_PLATFORM="win"
            shift
            ;;
        --linux)
            TARGET_PLATFORM="linux"
            shift
            ;;
        --skip-backend)
            SKIP_BACKEND="true"
            shift
            ;;
        --skip-renderer|--skip-web)
            SKIP_RENDERER="true"
            shift
            ;;
        --release)
            RELEASE_BUILD="true"
            shift
            ;;
        --help|-h)
            sed -n '2,30p' "$0"
            exit 0
            ;;
        *)
            log_error "未知参数: $1"
            echo "使用 --help 查看帮助。"
            exit 1
            ;;
    esac
done

# 默认平台：macOS
if [[ -z "$TARGET_PLATFORM" ]]; then
    case "$(uname -s)" in
        Darwin) TARGET_PLATFORM="mac" ;;
        Linux)  TARGET_PLATFORM="linux" ;;
        MINGW*|MSYS*|CYGWIN*) TARGET_PLATFORM="win" ;;
        *)
            log_warn "无法识别操作系统，默认使用 mac 目标。"
            TARGET_PLATFORM="mac"
            ;;
    esac
fi

log_info "目标平台: $TARGET_PLATFORM"
log_info "项目根目录: $PROJECT_ROOT"
log_info "Desktop 目录: $DESKTOP_DIR"
log_info "输出目录: $OUTPUT_DIR"

if [[ "$RELEASE_BUILD" == "true" ]]; then
    if [[ "$TARGET_PLATFORM" != "mac" ]]; then
        log_error "--release 目前只支持 macOS；请使用 scripts/release-check-macos.sh。"
        exit 1
    fi
    if [[ "$SKIP_BACKEND" == "true" || "$SKIP_RENDERER" == "true" ]]; then
        log_error "正式发行不允许跳过 backend 或 renderer 构建。"
        exit 1
    fi
    log_info "委托给正式 macOS 发行门禁。"
    exec "$PROJECT_ROOT/scripts/release-check-macos.sh"
fi

# ----------------------------------------------------------------------------
# 依赖检查
# ----------------------------------------------------------------------------
check_dependency() {
    local cmd="$1"
    local hint="$2"
    if ! command -v "$cmd" &>/dev/null; then
        log_error "未找到命令: $cmd"
        echo "  $hint"
        exit 1
    fi
}

log_step "[1/6] 检查构建依赖"

check_dependency "node" "请安装 Node.js 22.12+（小于 23）: https://nodejs.org/"
check_dependency "npm" "请安装 npm (随 Node.js 一起提供)"

ALLOW_UNSUPPORTED_NODE="${DESKTOP_ALLOW_UNSUPPORTED_NODE:-${RELEASE_CHECK_ALLOW_UNSUPPORTED_NODE:-false}}"
read -r NODE_MAJOR NODE_MINOR < <(node -p "process.versions.node.split('.').slice(0, 2).join(' ')")
if [[ "$NODE_MAJOR" -lt 22 || ("$NODE_MAJOR" -eq 22 && "$NODE_MINOR" -lt 12) ]]; then
    log_error "Node.js 版本过低: $(node -v)，需要 >=22.12.0。"
    exit 1
elif [[ "$NODE_MAJOR" -gt 22 && "$ALLOW_UNSUPPORTED_NODE" != "true" ]]; then
    log_warn "当前 Node.js 版本 ($(node -v)) 高于官方推荐范围 (>=22.12.0 <23)，继续构建开发诊断产物。"
fi
log_ok "Node.js $(node -v)"

if [[ "$SKIP_BACKEND" != "true" ]]; then
    check_dependency "java" "请安装 JDK 21: https://adoptium.net/"
    check_dependency "mvn" "请安装 Apache Maven 3.8+: https://maven.apache.org/"
    check_dependency "jlink" "jlink 随 JDK 21 一起提供，请检查 JDK 安装。"

    JAVA_VERSION=$(java -version 2>&1 | head -1 | sed -n 's/.*version "\([0-9]*\).*/\1/p')
    if [[ "$JAVA_VERSION" != "21" ]]; then
        log_warn "期望 JDK 21，当前为 JDK $JAVA_VERSION（可能引发兼容性问题）。"
    else
        log_ok "JDK $JAVA_VERSION"
    fi
    log_ok "Maven $(mvn -v | head -1 | awk '{print $3}')"
fi

# ----------------------------------------------------------------------------
# 构建 Backend + JRE
# ----------------------------------------------------------------------------
if [[ "$SKIP_BACKEND" == "true" ]]; then
    log_warn "跳过后端构建 (--skip-backend)"
else
    log_step "[2/6] 构建后端 JAR + JRE + TS CLI + Local Service"
    bash "$SCRIPT_DIR/build-backend.sh"
    log_ok "后端构建完成"
fi

# ----------------------------------------------------------------------------
# 构建 Desktop Renderer
# ----------------------------------------------------------------------------
if [[ "$SKIP_RENDERER" == "true" ]]; then
    log_warn "跳过 Desktop Renderer 构建 (--skip-renderer)"
else
    log_step "[3/6] 构建 Desktop Renderer"

    install_deps_if_needed() {
        local target_dir="$1"
        if [[ "$SKIP_INSTALL" == "true" ]]; then
            return
        fi
        if [[ -d "${target_dir}/node_modules" ]]; then
            log_info "node_modules 已存在，跳过 install: $target_dir"
            return
        fi
        log_info "安装依赖: $target_dir"
        (cd "$target_dir" && npm ci --silent --no-audit --no-fund)
    }

    RENDERER_DIR="$DESKTOP_DIR/src/renderer"
    install_deps_if_needed "$RENDERER_DIR"
    (cd "$RENDERER_DIR" && VITE_API_BASE="${WEB_API_BASE}" npm run build)

    log_step "[4/6] 复制 Renderer 构建产物到 desktop/dist/renderer"
    rm -rf "$DESKTOP_DIR/dist/renderer"
    mkdir -p "$DESKTOP_DIR/dist/renderer"
    cp -R "$RENDERER_DIR/dist/." "$DESKTOP_DIR/dist/renderer/"
    log_ok "Desktop Renderer 已复制"
fi

# ----------------------------------------------------------------------------
# 编译 Electron 主进程
# ----------------------------------------------------------------------------
log_step "[5/6] 编译 Electron 主进程 (tsc)"

install_deps_if_needed_desktop() {
    if [[ "$SKIP_INSTALL" == "true" ]]; then
        return
    fi
    if [[ -d "$DESKTOP_DIR/node_modules" ]]; then
        log_info "desktop/node_modules 已存在，跳过 install"
        return
    fi
    log_info "安装 desktop 依赖"
    (cd "$DESKTOP_DIR" && npm ci --silent --no-audit --no-fund)
}
install_deps_if_needed_desktop

(cd "$DESKTOP_DIR" && npm run build:main)
log_ok "Electron 主进程编译完成"

# ----------------------------------------------------------------------------
# macOS 开发诊断说明
# ----------------------------------------------------------------------------
setup_macos_notarization() {
    log_warn "这是开发诊断构建，不能作为签名/公证发行候选。"
    echo "  正式 macOS 发行请使用: ./scripts/build-all.sh --release"
}

# ----------------------------------------------------------------------------
# 打包
# ----------------------------------------------------------------------------
log_step "[6/6] 打包桌面应用 (electron-builder)"

BUILDER_TARGET_FLAG=""
case "$TARGET_PLATFORM" in
    mac)
        BUILDER_TARGET_FLAG="--mac"
        setup_macos_notarization
        ;;
    win)
        BUILDER_TARGET_FLAG="--win"
        ;;
    linux)
        BUILDER_TARGET_FLAG="--linux"
        ;;
esac

# 每次开发构建使用新的输出目录，避免覆盖正式候选或既有证据。
mkdir -p "$OUTPUT_DIR"

log_info "执行: electron-builder $BUILDER_TARGET_FLAG -c.directories.output=$OUTPUT_DIR $BUILDER_ARGS"
# shellcheck disable=SC2086 # BUILDER_ARGS 需要按空格拆分为多个参数
(cd "$DESKTOP_DIR" && npx electron-builder $BUILDER_TARGET_FLAG -c.directories.output="$OUTPUT_DIR" $BUILDER_ARGS)

# ----------------------------------------------------------------------------
# 输出构建产物
# ----------------------------------------------------------------------------
log_step "构建完成"
echo
log_info "构建产物目录: $OUTPUT_DIR"
echo
echo "----------------------------------------"
echo "  产物列表:"
echo "----------------------------------------"
if [[ -d "$OUTPUT_DIR" ]]; then
    # shellcheck disable=SC2012 # 产物文件名均为 ASCII，ls 输出可读性更好
    ls -lh "$OUTPUT_DIR" | tail -n +2 | while read -r line; do
        echo "  $line"
    done
else
    log_warn "输出目录不存在: $OUTPUT_DIR"
fi
echo "----------------------------------------"
echo
log_ok "全部构建步骤已完成。"
