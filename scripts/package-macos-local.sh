#!/usr/bin/env bash
# ==============================================================================
# AI Agent Knowledge Desk - macOS 独立安装包构建脚本 (Zero-Dependency Release)
# 产物: 包含裁剪 JRE 的独立 macOS arm64 DMG 与 ZIP 安装包
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="${ROOT_DIR}/desktop/release"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${PURPLE}================================================================${NC}"
echo -e "${PURPLE}   📦 AI Agent Knowledge Desk - macOS 独立安装包构建闭环      ${NC}"
echo -e "${PURPLE}================================================================${NC}"
echo ""

# 1. 检查 macOS 环境
ARCH="$(uname -m)"
if [[ "$ARCH" != "arm64" && "$ARCH" != "x86_64" ]]; then
    echo -e "${RED}不支持的架构: $ARCH${NC}" >&2
    exit 1
fi
echo -e "${BLUE}[1/4] 构建架构: macOS (${ARCH})${NC}"

# 2. 构建后端 JAR、TS CLI、Local Service 及 jlink 裁剪 JRE
echo -e "${BLUE}[2/4] 构建后端及内嵌 JRE 运行时...${NC}"
cd "${ROOT_DIR}/desktop"
bash scripts/build-backend.sh

# 3. 构建前端 Renderer 并执行 Electron 打包
echo -e "${BLUE}[3/4] 构建前端与打包 macOS 原生安装包...${NC}"
npm run build

if [[ "$ARCH" == "arm64" ]]; then
    npm run dist:mac:arm64
else
    npm run dist:mac:x64
fi

# 4. 产物校验与 SHA-256 生成
echo -e "${BLUE}[4/4] 验证发布产物与生成校验和...${NC}"
cd "${RELEASE_DIR}"

DMG_FILE=$(find . -maxdepth 1 -name "*.dmg" | head -n 1)
ZIP_FILE=$(find . -maxdepth 1 -name "*.zip" | head -n 1)

if [[ -z "${DMG_FILE}" ]]; then
    echo -e "${RED}未找到生成的 DMG 文件！${NC}" >&2
    exit 1
fi

shasum -a 256 ./*.dmg ./*.zip > SHA256SUMS 2>/dev/null || true

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  🎉 macOS 独立安装包构建成功！                                 ${NC}"
echo -e "${GREEN}  📁 输出目录: ${RELEASE_DIR}                                  ${NC}"
echo -e "${GREEN}  💿 DMG 安装包: ${DMG_FILE}                                   ${NC}"
echo -e "${GREEN}  🔒 校验文件: SHA256SUMS                                      ${NC}"
echo -e "${GREEN}  ✨ 特性: 内置裁剪 Java 21 JRE 与 H2，无需外部依赖，双击即用！   ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
