# AI Agent 桌面客户端（Mac + Windows）实施计划

## 摘要

将现有 AI Agent 项目改造为 Mac + Windows 双平台桌面客户端。采用 **Electron** 封装现有 React 前端，**内嵌 Spring Boot 后端**（H2 替代 PostgreSQL、Caffeine 替代 Redis），使用 **jlink 精简 JRE** 打包 Java 运行时，同时集成 CLI 终端面板并保留独立 CLI 工具。

---

## 当前状态分析

### 项目结构
```
AI-agent/
├── backend/          # Spring Boot 3.3.2, Java 21, PostgreSQL + Redis + Flyway
├── web/              # React 18 + TypeScript + Vite 5
├── cli/              # Java Picocli CLI
├── scripts/          # 部署/冒烟测试脚本
├── env/              # 环境变量模板
└── docker-compose.yml
```

### 关键依赖
| 组件 | 当前技术 | 桌面版替代 |
|------|----------|-----------|
| 数据库 | PostgreSQL 16 | H2 嵌入式 |
| 缓存 | Redis 7 | Caffeine 内存缓存 |
| 前端 | React + Vite (浏览器) | Electron 封装 |
| Java 运行时 | 系统 JRE | jlink 精简 JRE |
| 部署 | Docker Compose | electron-builder 安装包 |

### Redis 使用点（需替换为 Caffeine）
1. `RedisRateLimiterService` - 令牌桶限流（increment + expire）
2. `RedisSessionCacheService` - 会话消息缓存（get/set/delete with TTL）

### 数据库 Schema（需 H2 兼容）
- 4 张表：users, conversation_sessions, messages, tool_audits
- 使用 PostgreSQL 特性：UUID 主键、TIMESTAMP WITH TIME ZONE、TEXT 类型
- Flyway 迁移脚本使用 PostgreSQL 方言

---

## 实施步骤

### 第一阶段：后端桌面化适配

#### 1.1 创建 Spring Profile `desktop`
- **文件**: `backend/src/main/resources/application-desktop.yml`
- **内容**:
  - 数据源切换为 H2：`jdbc:h2:file:${app.data-dir:/tmp/ai-agent}/db;AUTO_SERVER=TRUE`
  - JPA ddl-auto 改为 `update`（桌面版不用 Flyway）
  - 禁用 Flyway
  - 禁用 Redis 自动配置
  - 调整限流参数（桌面单用户，放宽限制）
  - 设置服务端口为动态分配或固定 18080

#### 1.2 添加 H2 和 Caffeine 依赖
- **文件**: `backend/pom.xml`
- 添加 `spring-boot-starter-cache` + `caffeine` 依赖
- 添加 `com.h2database:h2` runtime 依赖（scope: runtime）
- 添加 Maven profile `desktop`，在此 profile 下排除 `spring-boot-starter-data-redis`、`flyway-core`、`flyway-database-postgresql`、`postgresql` 依赖

#### 1.3 实现 Caffeine 缓存替代
- **新建文件**: `backend/src/main/java/com/agent/mvp/infra/CaffeineRateLimiterService.java`
  - 实现 `RateLimiterService` 接口（需抽取）
  - 使用 `ConcurrentHashMap<String, RateLimitBucket>` + Caffeine 定时过期
- **新建文件**: `backend/src/main/java/com/agent/mvp/infra/CaffeineSessionCacheService.java`
  - 实现 `SessionCacheService` 接口（需抽取）
  - 使用 `Cache<UUID, List<MessageResponse>>` + 5 分钟 TTL

#### 1.4 抽取缓存接口
- **新建文件**: `backend/src/main/java/com/agent/mvp/infra/RateLimiterService.java`（接口）
- **新建文件**: `backend/src/main/java/com/agent/mvp/infra/SessionCacheService.java`（接口）
- **修改**: `RedisRateLimiterService` 和 `RedisSessionCacheService` 实现对应接口
- **修改**: 所有注入点改为依赖接口而非实现类

#### 1.5 创建桌面版条件配置类
- **新建文件**: `backend/src/main/java/com/agent/mvp/config/DesktopCacheConfig.java`
  - `@Profile("desktop")` 激活
  - 注册 Caffeine 实现的 Bean
- **修改文件**: `backend/src/main/java/com/agent/mvp/config/SecurityConfig.java`
  - CORS 配置增加 `localhost:18080` 和 Electron `file://` 协议

#### 1.6 H2 数据库兼容性
- **新建文件**: `backend/src/main/resources/db/h2/V1__init_schema.sql`
  - 将 PostgreSQL 方言转为 H2 兼容语法
  - `TIMESTAMP WITH TIME ZONE` → `TIMESTAMP`
  - UUID 类型保持（H2 支持）
  - 移除 PostgreSQL 特有的索引语法（如有）
- **修改**: `application-desktop.yml` 中配置 H2 初始化脚本路径

#### 1.7 后端启动入口优化
- **修改**: `AgentBackendApplication.java` 或新建 `DesktopBackendLauncher.java`
  - 支持 `--headless` 模式（不打开浏览器）
  - 支持 `--port` 参数指定端口
  - 支持 `--data-dir` 参数指定数据目录
  - 优雅关闭支持（SIGTERM 处理）

---

### 第二阶段：Electron 桌面应用

#### 2.1 创建 desktop 目录结构
```
desktop/
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── src/
│   ├── main/
│   │   ├── index.ts              # Electron 主进程入口
│   │   ├── backend-manager.ts    # Spring Boot 后端生命周期管理
│   │   ├── jre-resolver.ts      # JRE 路径解析
│   │   ├── cli-manager.ts       # CLI 进程管理
│   │   ├── window-manager.ts    # 窗口管理
│   │   ├── ipc-handlers.ts      # IPC 通信处理
│   │   └── tray.ts              # 系统托盘
│   ├── preload/
│   │   └── index.ts             # preload 脚本
│   └── renderer/                # 复用 web/src 的代码
│       └── (symlink 或引用 web/src)
├── resources/
│   ├── icons/                   # 应用图标 (mac .icns, win .ico)
│   └── jre/                     # 打包时放入精简 JRE
└── scripts/
    ├── build-jre.sh             # jlink 构建 JRE 脚本
    └── build-backend.sh         # Maven 打包后端脚本
```

#### 2.2 Electron 主进程核心逻辑
- **`backend-manager.ts`**:
  - 启动时定位 JRE → 执行 `java -jar backend.jar --spring.profiles.active=desktop --port=${port} --data-dir=${userDataDir}`
  - 健康检查轮询 `http://localhost:${port}/api/system/health/ready`，最多等待 30 秒
  - 关闭时发送 SIGTERM，等待优雅退出，超时则 SIGKILL
  - 端口冲突检测与自动重试

- **`window-manager.ts`**:
  - 主窗口：加载 `http://localhost:${port}`（连接内嵌后端）
  - 开发模式：加载 Vite dev server
  - 窗口标题、大小、最小尺寸配置
  - 单实例锁（防止多开）

- **`cli-manager.ts`**:
  - 管理 CLI 子进程
  - 通过 IPC 将 CLI 输出推送到渲染进程的终端面板

- **`tray.ts`**:
  - 系统托盘图标
  - 右键菜单：显示窗口、打开数据目录、退出

#### 2.3 IPC 通信协议
```
主进程 ←→ 渲染进程 IPC 通道:
- backend:status     → 获取后端运行状态
- backend:restart    → 重启后端
- backend:logs       → 获取后端日志
- cli:execute        → 执行 CLI 命令
- cli:output         → CLI 输出流
- app:version        → 获取应用版本
- app:data-dir       → 获取数据目录路径
- app:open-data-dir  → 打开数据目录
```

#### 2.4 渲染进程适配
- **修改**: `web/src/api.ts`
  - API_BASE 改为动态获取（从 Electron IPC 或环境变量）
  - 桌面模式下不需要 CORS 处理
- **新建**: `web/src/components/TerminalPanel.tsx`
  - 集成 xterm.js 终端模拟器
  - 通过 IPC 与主进程 CLI 管理器通信
  - 支持常用 CLI 命令的快捷入口
- **修改**: `web/src/App.tsx`
  - 添加终端面板的显示/隐藏切换
  - 添加后端状态指示器
- **修改**: `web/vite.config.ts`
  - 添加 Electron 相关配置
  - 支持多入口（主进程 + 渲染进程）

#### 2.5 Electron 打包配置
- **文件**: `desktop/electron-builder.yml`
```yaml
appId: com.ai-agent.desktop
productName: AI Agent
directories:
  output: dist
  buildResources: resources
files:
  - src/**/*
  - package.json
extraResources:
  - from: backend-jre
    to: backend-jre
    filter:
      - "**/*"
mac:
  category: public.app-category.developer-tools
  target:
    - dmg
    - zip
  icon: resources/icons/icon.icns
  hardenedRuntime: true
  entitlements: resources/entitlements.mac.plist
win:
  target:
    - nsis
    - portable
  icon: resources/icons/icon.ico
  artifactName: "${productName}-${version}-Setup.${ext}"
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
```

---

### 第三阶段：构建流水线

#### 3.1 jlink 精简 JRE 构建
- **文件**: `desktop/scripts/build-jre.sh`
  - 检测当前 Java 版本（需 JDK 21）
  - 执行 `jlink --add-modules java.base,java.sql,java.naming,java.management,java.security.jgss,java.instrument --output backend-jre/jre --strip-debug --no-header-files --no-man-pages --compress=2`
  - 预估大小：~50MB

#### 3.2 后端打包脚本
- **文件**: `desktop/scripts/build-backend.sh`
  - `mvn package -Pdesktop -DskipTests`
  - 将 `target/backend-0.1.0-SNAPSHOT.jar` 复制到 `desktop/backend-jre/`
  - 执行 `build-jre.sh` 生成精简 JRE

#### 3.3 前端构建适配
- **修改**: `web/vite.config.ts`
  - 添加 Electron 渲染进程构建配置
  - 输出目录适配 Electron 加载方式

#### 3.4 完整构建脚本
- **文件**: `desktop/scripts/build-all.sh`
  1. 构建后端 JAR（desktop profile）
  2. 构建 jlink JRE
  3. 构建前端
  4. 执行 electron-builder 打包

---

### 第四阶段：CLI 集成

#### 4.1 CLI JAR 打包
- `cli/pom.xml` 已有 `spring-boot-maven-plugin`，可直接 `mvn package` 生成可执行 JAR
- 将 CLI JAR 也放入 `extraResources` 与后端共用 JRE

#### 4.2 终端面板组件
- **新建**: `web/src/components/TerminalPanel.tsx`
  - 使用 xterm.js + xterm-addon-fit
  - 命令历史记录
  - 预设快捷命令按钮（login, stream-chat, tool-stats 等）
  - 输出语法高亮

#### 4.3 CLI 进程管理
- **`cli-manager.ts`**:
  - 启动 CLI 进程：`jre/bin/java -jar cli.jar <command> <args>`
  - 管道 stdout/stderr 到渲染进程
  - 支持交互式输入（如 login 命令）
  - 进程池管理（限制并发 CLI 进程数）

---

### 第五阶段：平台特定处理

#### 5.1 macOS 特定
- 代码签名配置（`hardenedRuntime`）
- `entitlements.mac.plist`（网络访问权限）
- `.dmg` 安装包背景图
- Apple Silicon (M1/M2/M3/M4/M5) 原生支持（JRE 需 aarch64 版本）

#### 5.2 Windows 特定
- NSIS 安装器配置
- 路径处理（反斜杠、空格、中文路径）
- Windows Defender 智能屏幕提示处理
- 数据目录：`%APPDATA%/ai-agent/`

#### 5.3 跨平台数据目录
| 平台 | 数据目录 |
|------|---------|
| macOS | `~/Library/Application Support/ai-agent/` |
| Windows | `%APPDATA%/ai-agent/` |

数据目录内容：
```
ai-agent/
├── db/                 # H2 数据库文件
├── logs/               # 后端日志
├── workspace/          # 工作空间
└── config/             # 用户配置（可选）
```

---

### 第六阶段：测试与验证

#### 6.1 后端单元测试
- CaffeineRateLimiterService 测试
- CaffeineSessionCacheService 测试
- H2 数据库集成测试
- `desktop` profile 启动测试

#### 6.2 Electron 集成测试
- 后端启动/停止生命周期测试
- 端口冲突处理测试
- 窗口管理测试
- IPC 通信测试

#### 6.3 平台验证
- macOS (Apple Silicon) 安装 + 运行测试
- Windows 10/11 安装 + 运行测试
- 数据持久化验证（重启后数据保留）
- 升级安装验证

---

## 假设与决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 桌面框架 | Electron | 成熟稳定，与 React 生态完美兼容 |
| 嵌入式数据库 | H2 | Java 原生，零配置，JPA 完全兼容 |
| 缓存替代 | Caffeine | 纯 Java，高性能，API 简洁 |
| JRE 打包 | jlink 精简 JRE | 平衡体积和兼容性 |
| CLI 集成 | 内嵌终端 + 独立 CLI | 兼顾普通用户和高级用户 |
| 后端通信 | localhost HTTP | 复用现有 API，无需改造通信层 |
| 安装包格式 | Mac: DMG + Win: NSIS | 各平台最常用的安装方式 |

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| H2 与 PostgreSQL SQL 方言差异 | Schema 不兼容 | 编写 H2 专用初始化脚本，JPA ddl-auto=update |
| Spring Boot 启动慢（5-10秒） | 用户体验差 | 显示启动进度条，预编译 AOT 可选 |
| 安装包体积大（JRE + JAR） | 下载慢 | jlink 精简 + 压缩，预估 100-150MB |
| Windows 路径问题 | 运行时错误 | 统一使用 Path API，避免硬编码路径 |
| macOS 代码签名 | 无法分发给其他 Mac | 初期可 unsigned 开发，后续申请 Apple Developer |

## 预估工作量

| 阶段 | 主要工作 |
|------|---------|
| 第一阶段 | 后端适配（H2 + Caffeine + Profile） |
| 第二阶段 | Electron 桌面应用搭建 |
| 第三阶段 | 构建流水线 |
| 第四阶段 | CLI 集成 |
| 第五阶段 | 平台特定处理 |
| 第六阶段 | 测试与验证 |
