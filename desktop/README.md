# AI Agent Desktop

AI Agent 桌面客户端，基于 Electron 构建，集成后端 Java 服务、React Renderer、TS CLI、本地服务、Review/Skills/Computer Use 面板。

> 当前按单机 macOS 使用维护；签名、安装包和部署说明不是日常使用前提。

## 本机源代码启动

推荐让 Electron 附着到你手动启动的 desktop profile。这样改 Java 源码后无需重建内嵌 JAR，退出桌面端也不会停止后端。

```bash
# 首次：在仓库根目录创建被 git 忽略的本机配置，并替换两个持久化随机值
cp env/local-desktop.env.example env/local-desktop.env
chmod 600 env/local-desktop.env

# 终端 A：启动本机 H2 + Caffeine 后端
cd backend
set -a; source ../env/local-desktop.env; set +a
SPRING_PROFILES_ACTIVE=desktop SERVER_PORT=18080 SERVER_ADDRESS=127.0.0.1 mvn spring-boot:run

# 终端 B：启动 Renderer
cd ../desktop/src/renderer
npm install && npm run dev

# 终端 C：启动 Electron 并附着到终端 A
cd ../..
npm install && npm run dev:attached
```

`DESKTOP_BACKEND_URL` 默认是 `http://127.0.0.1:18080`，可改为其他本机端口；它只接受 `127.0.0.1`、`localhost` 或 `[::1]` 的 HTTP 地址，且拒绝路径、查询参数和凭据。

## 架构概览

```
desktop/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── index.ts       # 入口
│   │   ├── backend-manager.ts   # 后端进程管理（spawn JRE + jar）
│   │   ├── window-manager.ts    # 窗口管理
│   │   ├── tray-manager.ts      # 系统托盘
│   │   ├── cli-manager.ts       # TS CLI 子进程管理
│   │   ├── ipc-registry.ts      # IPC 通信
│   │   └── utils/               # 工具函数
│   └── preload/          # 预加载脚本
├── resources/            # 打包资源（图标、entitlements）
├── scripts/              # 构建脚本
│   ├── build-all.sh      # 全量构建
│   ├── build-backend.sh  # 后端 JAR + TS CLI
│   └── build-jre.sh      # jlink 生成最小化 JRE
├── electron-builder.yml  # electron-builder 配置
├── package.json
└── tsconfig.main.json
```

运行时，Electron 主进程会通过 `backend-manager` 启动一个内嵌的 Java 后端（JRE + jar），
监听本地端口（默认 18080），前端通过该端口与后端通信。

## 构建前置条件

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | 18+（推荐 20 LTS） | 构建 Electron + React Renderer |
| npm | 随 Node.js | 包管理 |
| JDK | 21 | 编译后端 + jlink 生成 JRE |
| Maven | 3.8+ | 后端构建 |
| 网络连接 | - | 首次构建需下载 npm 依赖、Maven 依赖 |

### macOS 额外要求（如需签名/公证）

- Apple Developer 账号
- 已安装的 Developer ID Application 证书（Keychain 中）
- 已创建的 App-Specific Password（用于公证）

## 开发模式运行

```bash
# 1. 安装 desktop 依赖
cd desktop
npm install

# 2. 启动后端（独立终端，开发模式）
cd ../backend
mvn spring-boot:run

# 3. 启动 Renderer 开发服务器（独立终端）
cd ../desktop/src/renderer
npm install
npm run dev

# 4. 启动 Electron（连接本地后端 + Renderer 开发服务器）
cd ../..
npm run dev
```

> 开发模式下，Electron 默认连接 `http://localhost:18080` 后端。
> Renderer 默认加载 `http://localhost:5173`；如需修改，设置 `DESKTOP_RENDERER_URL`。

## 打包命令

### 一键开发诊断构建

```bash
cd desktop

# macOS（默认，Apple Silicon + Intel）
./scripts/build-all.sh --mac

# Windows
./scripts/build-all.sh --win

# Linux
./scripts/build-all.sh --linux
```

脚本会自动完成：依赖检查 → 后端 JAR → JRE → TS CLI → Local Service → Renderer → tsc 编译 → electron-builder 打包。它的默认输出是带时间戳的 `desktop/release-dev/`，仅用于本机诊断，不能作为发布候选。

### 分步构建

```bash
cd desktop

# 仅编译 TypeScript（不打包）
npm run build:main

# 仅构建 Renderer
npm run build:renderer

# 完整构建（main + renderer）
npm run build

# 仅打包当前平台
npm run dist

# 指定平台
npm run dist:mac
npm run dist:mac:arm64
npm run dist:mac:x64
npm run dist:win
npm run dist:linux
```

### 跳过部分步骤

```bash
# 跳过后端构建（已有 backend-jre/）
./scripts/build-all.sh --mac --skip-backend

# 跳过 Renderer 构建（已有 dist/renderer/）
./scripts/build-all.sh --mac --skip-renderer
```

## macOS 正式发行

正式候选由仓库根目录的 `scripts/release-check-macos.sh` 或 GitHub Actions 工作流生成；两者都会强制精确 tag、干净源码、签名、公证、DMG/ZIP 完整性、Gatekeeper 和 stapler 验证。需要 Apple Developer 账号和以下环境变量：

| 环境变量 | 说明 | 示例 |
| --- | --- | --- |
| `APPLE_ID` | Apple ID 邮箱 | `you@example.com` |
| `APPLE_APP_SPECIFIC_PASSWORD` | 应用专用密码（非 Apple ID 密码） | `abcd-efgh-ijkl-mnop` |
| `APPLE_TEAM_ID` | 开发者团队 ID（10 位） | `ABCDE12345` |
| `CSC_LINK` | Developer ID Application `.p12` 的 base64 或安全路径 | `<p12>` |
| `CSC_KEY_PASSWORD` | `.p12` 密码 | `<password>` |

### 获取应用专用密码

1. 访问 https://appleid.apple.com
2. 登录后进入「登录和安全」→「应用专用密码」
3. 生成新密码

### 获取 Team ID

1. 访问 https://developer.apple.com/account
2. 「Membership」页面查看 Team ID

### 生成签名候选

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="ABCDE12345"
export CSC_LINK="<base64-p12-or-path>"
export CSC_KEY_PASSWORD="<certificate-password>"
export GITHUB_ACTOR="<github-user>"
export GITHUB_TOKEN="<packages-read-token>"

cd ..
./scripts/release-check-macos.sh
```

> 缺少任一签名/公证变量时，正式门禁会失败；`build-all.sh --mac` 只生成开发诊断产物。`build-all.sh --release --mac` 是正式门禁的兼容入口。

## 构建产物路径

```
desktop/release/                       # 仅正式 macOS 候选使用
├── AI Agent-0.1.0-beta.1-mac-arm64.dmg
├── AI Agent-0.1.0-beta.1-mac-arm64.zip
├── release-manifest.json
└── SHA256SUMS

desktop/release-dev/<timestamp>/       # build-all.sh 开发诊断输出
```

生成未签名的本地 macOS DMG/ZIP 诊断包后，可让仓库根目录门禁补充诊断证据：

```bash
RELEASE_CHECK_DESKTOP_DISTRIBUTABLE=true ./scripts/release-check.sh dev
```

输出文件：

- `desktop/release/release-manifest.json`：记录版本、Git commit、产物大小、SHA-256、`.app` 签名与 Gatekeeper 评估状态。
- `desktop/release/SHA256SUMS`：可随安装包一起发布的校验和文件。

正式 macOS 发布必须通过规范化门禁：

```bash
GITHUB_ACTOR=<github-user> GITHUB_TOKEN=<packages-read-token> \
CSC_LINK=<base64-p12-or-path> CSC_KEY_PASSWORD=<certificate-password> \
APPLE_ID=<apple-id> APPLE_APP_SPECIFIC_PASSWORD=<app-password> \
APPLE_TEAM_ID=<team-id> \
../scripts/release-check-macos.sh
```

如果只需要给已有产物补清单，不重新打包：

```bash
./scripts/release-manifest.sh
```

如果需要用发布门禁复查已有安装包，但不重新生成 DMG/ZIP：

```bash
RELEASE_CHECK_DESKTOP_DISTRIBUTABLE=true \
RELEASE_CHECK_REUSE_DESKTOP_DISTRIBUTABLE=true \
./scripts/release-check.sh dev
```

## 图标资源

构建前需准备图标文件并放入 `resources/icons/`：

| 平台 | 文件 | 格式 | 推荐尺寸 |
| --- | --- | --- | --- |
| macOS | `codejoy-icon.icns` | ICNS | 512x512 / 1024x1024 |
| Windows | `codejoy-icon.ico` | ICO | 256x256（多尺寸） |
| Linux | `codejoy-icon.png` | PNG | 512x512 |

> 若图标缺失，electron-builder 会使用默认图标并输出警告。

## 常见问题

### 1. JRE 构建失败：`jlink: not found`

**原因**：JDK 未正确安装或 `jlink` 不在 PATH 中。

**解决**：
```bash
# 检查 JDK
java -version
which jlink

# macOS 使用 Homebrew 安装
brew install openjdk@21
```

### 2. Maven 依赖下载失败 / 超时

**原因**：网络问题或 Maven 镜像未配置。

**解决**：配置国内镜像（如阿里云），编辑 `~/.m2/settings.xml`：
```xml
<mirror>
  <id>aliyun</id>
  <mirrorOf>central</mirrorOf>
  <url>https://maven.aliyun.com/repository/public</url>
</mirror>
```

### 3. npm install 失败 / 慢

**解决**：使用国内镜像
```bash
npm config set registry https://registry.npmmirror.com
```

### 4. macOS 签名失败：`no identity found`

**原因**：未安装 Developer ID Application 证书。

**解决**：
1. 在 https://developer.apple.com 下载证书
2. 双击 `.cer` 文件导入 Keychain Access
3. 确保证书状态为「有效」

### 5. macOS 公证失败：`Invalid credentials`

**原因**：`APPLE_ID` 或 `APPLE_APP_SPECIFIC_PASSWORD` 错误。

**解决**：
- 确认使用的是「应用专用密码」而非 Apple ID 密码
- 重新生成应用专用密码

### 6. 打包后应用启动闪退

**可能原因**：
- 后端 JAR 或 JRE 未正确打包（检查 `backend-jre/` 目录）
- 端口被占用（检查 18080 端口）
- 权限问题（macOS 沙箱限制）

**排查**：
```bash
# 从命令行启动应用查看日志
/Applications/AI\ Agent.app/Contents/MacOS/AI\ Agent
```

### 7. Renderer 构建失败

**原因**：`desktop/src/renderer/` 目录未安装依赖。

**解决**：
```bash
cd desktop/src/renderer && npm install
```

### 8. electron-builder 报错 `cannot find icon`

**原因**：图标文件缺失。

**解决**：将图标文件放入 `desktop/resources/icons/`，或临时移除 `electron-builder.yml` 中的 `icon` 配置使用默认图标。

## 相关文件

- [electron-builder.yml](./electron-builder.yml) - 打包配置
- [resources/entitlements.mac.plist](./resources/entitlements.mac.plist) - macOS 权限声明
- [scripts/build-all.sh](./scripts/build-all.sh) - 全量构建脚本
- [scripts/build-backend.sh](./scripts/build-backend.sh) - 后端构建脚本
- [scripts/build-jre.sh](./scripts/build-jre.sh) - JRE 构建脚本
