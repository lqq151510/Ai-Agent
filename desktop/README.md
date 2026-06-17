# AI Agent Desktop

AI Agent 桌面客户端，基于 Electron 构建，集成后端 Java 服务与 Web 前端。

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
| Node.js | 18+（推荐 20 LTS） | 构建 Electron + Web 前端 |
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

# 3. 启动 Web 前端开发服务器（独立终端）
cd ../web
npm install
npm run dev

# 4. 启动 Electron（连接本地后端 + Web 开发服务器）
cd ../desktop
npm run dev
```

> 开发模式下，Electron 默认连接 `http://localhost:18080` 后端。
> 如需修改，设置环境变量 `DESKTOP_VITE_API_BASE`。

## 打包命令

### 一键构建（推荐）

```bash
cd desktop

# macOS（默认，Apple Silicon + Intel）
./scripts/build-all.sh --mac

# Windows
./scripts/build-all.sh --win

# Linux
./scripts/build-all.sh --linux
```

脚本会自动完成：依赖检查 → 后端 JAR → JRE → Web 前端 → tsc 编译 → electron-builder 打包。

### 分步构建

```bash
cd desktop

# 仅编译 TypeScript（不打包）
npm run build:main

# 仅构建 Web 前端
npm run build:web

# 完整构建（tsc + web）
npm run build

# 仅打包当前平台
npm run dist

# 指定平台
npm run dist:mac
npm run dist:win
npm run dist:linux
```

### 跳过部分步骤

```bash
# 跳过后端构建（已有 backend-jre/）
./scripts/build-all.sh --mac --skip-backend

# 跳过 Web 前端构建（已有 dist/renderer/）
./scripts/build-all.sh --mac --skip-web
```

## macOS 公证配置

公证需要 Apple Developer 账号和以下环境变量：

| 环境变量 | 说明 | 示例 |
| --- | --- | --- |
| `APPLE_ID` | Apple ID 邮箱 | `you@example.com` |
| `APPLE_APP_SPECIFIC_PASSWORD` | 应用专用密码（非 Apple ID 密码） | `abcd-efgh-ijkl-mnop` |
| `APPLE_TEAM_ID` | 开发者团队 ID（10 位） | `ABCDE12345` |

### 获取应用专用密码

1. 访问 https://appleid.apple.com
2. 登录后进入「登录和安全」→「应用专用密码」
3. 生成新密码

### 获取 Team ID

1. 访问 https://developer.apple.com/account
2. 「Membership」页面查看 Team ID

### 启用公证构建

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="ABCDE12345"

cd desktop
./scripts/build-all.sh --mac
```

> 若未设置 `APPLE_TEAM_ID`，脚本会跳过公证并输出警告，产物仍可使用但无法通过 Gatekeeper。

## 构建产物路径

```
desktop/release/
├── AI Agent-0.1.0-mac-arm64.dmg      # macOS Apple Silicon 安装包
├── AI Agent-0.1.0-mac-arm64.zip      # macOS Apple Silicon 免安装
├── AI Agent-0.1.0-mac-x64.dmg        # macOS Intel 安装包
├── AI Agent-0.1.0-mac-x64.zip        # macOS Intel 免安装
├── AI Agent-0.1.0-win-x64.exe        # Windows 安装包
├── AI Agent-0.1.0-linux-x64.AppImage # Linux 免安装
└── AI Agent-0.1.0-linux-x64.deb      # Linux deb 包
```

## 图标资源

构建前需准备图标文件并放入 `resources/icons/`：

| 平台 | 文件 | 格式 | 推荐尺寸 |
| --- | --- | --- | --- |
| macOS | `icon.icns` | ICNS | 512x512 / 1024x1024 |
| Windows | `icon.ico` | ICO | 256x256（多尺寸） |
| Linux | `icon.png` | PNG | 512x512 |

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

### 7. Web 前端构建失败

**原因**：`web/` 目录未安装依赖。

**解决**：
```bash
cd web && npm install
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
