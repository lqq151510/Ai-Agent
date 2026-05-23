# Java AI Agent MVP - Code Wiki 文档

## 文档元信息

| 项目 | 内容 |
|------|------|
| 适用分支 | `main`（默认） |
| 校验日期 | `2026-05-14` |
| 校验方式 | 以当前仓库源码与配置文件为准，全量核对所有模块、常量、配置、SSE 事件与接口说明 |
| 维护约定 | 新增/变更功能时同步更新对应章节，并在文末“变更记录”追加条目 |

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [后端模块详解](#3-后端模块详解)
4. [前端模块详解](#4-前端模块详解)
5. [CLI 模块详解](#5-cli-模块详解)
6. [Desktop 桌面客户端模块详解](#6-desktop-桌面客户端模块详解)
7. [关键类与函数说明](#7-关键类与函数说明)
8. [数据模型与数据库](#8-数据模型与数据库)
9. [REST API 接口](#9-rest-api-接口)
10. [依赖关系](#10-依赖关系)
11. [配置参数](#11-配置参数)
12. [部署与运行](#12-部署与运行)
13. [开发指南](#13-开发指南)
14. [术语表](#14-术语表)
15. [变更记录](#15-变更记录)

---

## 1. 项目概述

### 1.1 项目简介

Java AI Agent MVP 是一个完整的 AI 智能助手应用，采用前后端分离架构，提供 Web UI 和 CLI 两种交互方式。系统核心能力包括：

- **多模型对话**：支持 OpenAI 兼容 API 的模型提供商，可配置默认模型
- **流式对话**：基于 SSE（Server-Sent Events）的实时流式响应
- **工具调用**：Agent 可自主调用代码搜索、文件读取、目录浏览、POM 分析等工具
- **会话管理**：完整的会话生命周期管理，支持 JSON/Markdown 导出
- **认证授权**：基于 JWT 的无状态认证，支持 Refresh Token 轮转
- **速率限制**：基于 Redis 的分布式限流，区分普通用户与高级用户
- **审计与报表**：工具调用审计、统计分析、发布报告生成

### 1.2 技术栈

| 层级 | 技术选型 | 版本 |
|------|----------|------|
| 后端框架 | Spring Boot | 3.3.2 |
| 编程语言 | Java | 21 |
| 数据库 | PostgreSQL | 16 |
| 缓存 | Redis | 7 |
| 前端框架 | React + TypeScript | React 18.3 / TS 5.5 |
| 状态管理 | Zustand | 5.0.12 |
| 构建工具（后端） | Maven | - |
| 构建工具（前端） | Vite | 5.4.2 |
| 容器化 | Docker + Docker Compose | - |
| 认证 | JWT (jjwt) | 0.12.6 |
| 数据库迁移 | Flyway | 10.22.0 |
| CLI 框架 | Picocli | 4.7.6 |
| 桌面框架 | Electron + TypeScript | Electron 33 / TS 5.5 |
| 响应式 HTTP | Spring WebFlux + Reactor Netty | - |

### 1.3 项目结构

```
AI-agent/
├── backend/                    # Spring Boot 后端服务
│   ├── src/main/java/          # Java 源码
│   │   └── com/agent/mvp/      # 根包
│   │       ├── agent/           # Agent 核心模块
│   │       ├── auth/            # 认证授权模块
│   │       ├── common/          # 公共模块
│   │       ├── config/          # 配置模块
│   │       ├── infra/           # 基础设施模块
│   │       ├── session/         # 会话管理模块
│   │       ├── system/          # 系统管理模块
│   │       └── tooling/         # 工具模块
│   ├── src/main/resources/     # 资源文件
│   │   ├── db/migration/        # Flyway 迁移脚本
│   │   ├── application.yml      # 应用配置
│   │   └── logback-spring.xml   # 日志配置
│   ├── src/test/               # 测试代码
│   ├── Dockerfile              # 后端容器构建
│   └── pom.xml                 # Maven 配置
├── web/                        # React 前端应用
│   ├── src/
│   │   ├── components/         # UI 组件
│   │   ├── stores/             # Zustand 状态管理
│   │   ├── App.tsx             # 主应用组件
│   │   ├── api.ts              # API 客户端
│   │   ├── types.ts            # TypeScript 类型
│   │   ├── utils.ts            # 工具函数
│   │   ├── main.tsx            # 入口文件
│   │   └── styles.css          # 全局样式
│   ├── Dockerfile              # 前端容器构建
│   ├── nginx.conf              # Nginx 反向代理配置
│   ├── package.json            # NPM 配置
│   ├── vite.config.ts          # Vite 配置
│   └── tsconfig.json           # TypeScript 配置
├── cli/                        # Java CLI 工具
│   ├── src/main/java/          # CLI 源码
│   └── pom.xml                 # Maven 配置
├── desktop/                    # Electron 桌面客户端
│   ├── src/main/               # Electron 主进程
│   │   ├── index.ts            # 应用入口（窗口/托盘/IPC）
│   │   ├── backend-manager.ts  # 后端进程管理
│   │   └── cli-manager.ts      # CLI 进程管理
│   ├── src/preload/            # 预加载脚本（contextBridge）
│   ├── scripts/                # 构建脚本（JRE/后端/全量）
│   ├── resources/              # 资源文件（图标/签名）
│   ├── package.json            # NPM 配置
│   ├── electron-builder.yml    # Electron 打包配置
│   └── tsconfig.main.json      # TypeScript 配置
├── env/                        # 环境配置模板
│   ├── dev.env.example
│   ├── staging.env.example
│   └── prod.env.example
├── scripts/                    # 运维脚本
│   ├── deploy.sh               # 部署脚本
│   ├── rollback.sh             # 回滚脚本
│   ├── smoke.sh                # 冒烟测试脚本
│   └── render-release-report.sh # 报告渲染脚本
├── uml/                        # UML 图表
├── tools/                      # 辅助工具（PlantUML 等）
├── artifacts/                  # 测试产物
├── docker-compose.yml          # Docker Compose 编排
└── pom.xml                     # 父 POM
```

---

## 2. 系统架构

> 当前实现：本节流程、事件名、超时和线程模型已按 `backend` 当前代码实现校验。
> 设计说明：架构图是理解系统边界的示意视图，排障时以 Controller/Service 真实调用链为准。

### 2.1 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                          客户端层                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │     Web UI       │  │     CLI 工具      │  │  Desktop App  │  │
│  │  React + Vite    │  │  Picocli + Java   │  │  Electron     │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
└───────────┼──────────────────────┼───────────────────┼───────────┘
            │                      │                   │
            │   HTTP / SSE         │  HTTP / SSE       │ IPC + HTTP
            │                      │                   │
┌───────────┼──────────────────────┼───────────────────┼───────────┐
│           │    Nginx 反向代理     │                   │            │
│  ┌────────▼──────────────────────▼───────────────────▼──────────┐ │
│  │                    Spring Boot Backend                       │ │
│  │                                                              │ │
│  │  ┌──────────────────────────────────────────────────────┐   │ │
│  │  │                  Controller 层                        │   │ │
│  │  │  AgentController  AuthController  SessionController  │   │ │
│  │  │  SystemController  ReleaseReportController           │   │ │
│  │  │  ToolStatsController                                  │   │ │
│  │  └──────────────────────┬───────────────────────────────┘   │ │
│  │  ┌──────────────────────▼───────────────────────────────┐   │ │
│  │  │                   Service 层                          │   │ │
│  │  │  AgentService  AuthService  SessionService            │   │ │
│  │  │  ModelRoutingService  CodeToolService                 │   │ │
│  │  │  ToolAuditService  ReleaseReportService               │   │ │
│  │  │  SystemDiagnosticsService                              │   │ │
│  │  └──────────┬───────────────┬───────────────────────────┘   │ │
│  │  ┌──────────▼───────────────▼───────────────────────────┐   │ │
│  │  │           Repository / Provider / Infra 层            │   │ │
│  │  │  UserRepository  ConversationSessionRepository        │   │ │
│  │  │  MessageRepository  ToolAuditRepository               │   │ │
│  │  │  OpenAiModelProvider  RedisRateLimiterService         │   │ │
│  │  │  RedisSessionCacheService                              │   │ │
│  │  └──────────┬──────────────────────────┬────────────────┘   │ │
│  └─────────────┼──────────────────────────┼────────────────────┘ │
└────────────────┼──────────────────────────┼──────────────────────┘
                 │                          │
        ┌────────▼────────┐        ┌────────▼────────┐
        │   PostgreSQL    │        │     Redis        │
        │   (持久化存储)   │        │  (缓存/限流)     │
        └─────────────────┘        └──────────────────┘
                                           │
                                    ┌──────▼──────┐
                                    │ OpenAI API  │
                                    │ (模型服务)   │
                                    └─────────────┘
```

### 2.2 请求处理流程

#### 同步对话流程

```
Client → POST /api/agent/chat
  → AgentController.chat()
    → JWT 认证校验
    → 速率限制检查
    → AgentService.chat()
      → SessionService.findOwnedSession()     # 查找会话
      → ModelRoutingService.resolve()          # 解析模型配置
      → SessionService.saveMessage()           # 保存用户消息
      → AgentService.executeLoop()             # 执行 Agent 循环
        → SessionService.listRecentMessages()  # 获取历史消息
        → AgentToolOrchestrator.listToolSpecs()# 获取工具定义
        → ModelGateway.chat()                  # 调用模型
        → [如有工具调用] → AgentToolOrchestrator.execute() → CodeToolService
        → SessionService.saveMessage()         # 保存各步骤消息
        → ToolAuditService.saveAll()           # 审计记录
      → 返回 ChatResponse
```

#### 流式对话流程

```
Client → POST /api/agent/chat/stream
  → AgentController.stream()
    → JWT 认证校验
    → 速率限制检查
    → 创建 SseEmitter (超时 300s)
    → 启动心跳线程 (10s 间隔)
    → 提交到流式线程池
      → AgentService.streamChat()
        → 发送 meta 事件 (会话ID, 模型信息)
        → AgentService.executeLoop()
          → 最后一步使用 ModelGateway.stream() 流式调用
          → 每个文本片段发送 chunk 事件
        → 发送 done 事件 (完整响应)
```

### 2.3 Agent 循环机制

AgentService 的核心是 `executeLoop()` 方法，实现了 ReAct（Reasoning + Acting）模式：

```
┌─────────────────────────────────────────┐
│          Agent Loop (最多 4 步)          │
│                                         │
│  1. 构建消息上下文 (system + history)    │
│  2. 调用模型 (附带工具定义)              │
│  3. 模型返回:                           │
│     ├─ 纯文本 → 结束循环，返回回复       │
│     └─ 工具调用 → 执行工具:             │
│        ├─ searchCode (代码搜索)          │
│        ├─ readFile (文件读取)            │
│        ├─ listRepoTree (目录浏览)        │
│        └─ analyzePom (POM 分析)         │
│  4. 将工具结果追加到消息上下文            │
│  5. 如果工具执行出错 → 安全停止          │
│  6. 如果达到最大步数 → 安全停止          │
│  7. 否则回到步骤 2                       │
└─────────────────────────────────────────┘
```

### 2.4 认证流程

```
┌──────────┐    POST /api/auth/register     ┌──────────┐
│  Client  │ ──────────────────────────────→ │  Server  │
│          │ ←── UserProfileResponse        │          │
│          │                                 │          │
│          │    POST /api/auth/login         │          │
│          │ ──────────────────────────────→ │          │
│          │ ←── TokenResponse              │          │
│          │     (accessToken + refreshToken)│          │
│          │                                 │          │
│          │    GET /api/auth/me             │          │
│          │ ── Authorization: Bearer ─────→ │          │
│          │ ←── UserProfileResponse        │          │
│          │                                 │          │
│          │    POST /api/auth/refresh       │          │
│          │ ── { refreshToken } ─────────→ │          │
│          │ ←── TokenResponse (新令牌对)    │          │
└──────────┘                                 └──────────┘
```

---

## 3. 后端模块详解

> 当前实现：本节类与方法基于 `com.agent.mvp` 当前代码结构整理。
> 设计说明：职责划分用于理解边界，重构时允许在不改变外部契约的前提下调整包内实现。

### 3.1 Agent 核心模块 (`com.agent.mvp.agent`)

**职责**：处理 AI 对话的核心逻辑，包括模型调用、工具编排、上下文管理。

#### 子包结构

| 子包 | 职责 |
|------|------|
| `dto` | 数据传输对象（请求/响应/中间模型） |
| `provider` | 模型提供商抽象与实现 |
| `service` | 核心业务服务 |
| `tooling` | 工具编排与定义 |

#### 核心类

| 类名 | 职责 |
|------|------|
| `AgentController` | REST 端点，管理 SSE 流式连接和线程池 |
| `AgentService` | Agent 对话核心逻辑，执行 ReAct 循环 |
| `ModelGateway` | 模型网关，根据 Provider 类型路由到具体实现 |
| `ModelRoutingService` | 解析请求/会话/配置中的模型参数 |
| `ModelProvider` (接口) | 模型提供商抽象接口 |
| `OpenAiModelProvider` | OpenAI 兼容 API 的模型提供商实现 |
| `AgentToolOrchestrator` | 工具编排器，定义工具规范并执行工具调用 |
| `ModelProviderType` (枚举) | 模型提供商类型枚举（目前仅 OPENAI） |

#### DTO 说明

| DTO | 用途 |
|-----|------|
| `ChatRequest` | 对话请求（sessionId, message, provider?, model?） |
| `ChatResponse` | 对话响应（sessionId, provider, model, reply, latencyMs, toolTraces） |
| `ChatStreamMeta` | 流式元数据事件 |
| `ModelChatMessage` | 发送给模型的消息（role, content, name?, toolCallId?, toolCalls?） |
| `ModelChatRequest` | 模型请求（model, messages, tools, toolChoice） |
| `ModelChatResponse` | 模型响应（content, latencyMs, toolCalls, finishReason） |
| `ResolvedModelConfig` | 解析后的模型配置（provider, model） |
| `ToolCall` | 工具调用（id, name, argumentsJson） |
| `ToolResult` | 工具执行结果（id, toolName, argsJson, status, durationMs, output） |
| `ToolRunBundle` | 工具运行捆绑 |
| `ToolSpec` | 工具规范定义（name, description, inputJsonSchema） |

### 3.2 认证授权模块 (`com.agent.mvp.auth`)

**职责**：用户注册、登录、JWT 令牌管理、请求认证过滤。

#### 子包结构

| 子包 | 职责 |
|------|------|
| `dto` | 认证相关 DTO |
| `entity` | 用户实体 |
| `repo` | 用户数据访问 |
| `security` | 安全过滤器与认证主体 |
| `service` | 认证业务逻辑 |

#### 核心类

| 类名 | 职责 |
|------|------|
| `AuthController` | 认证 REST 端点，含速率限制 |
| `AuthService` | 认证业务逻辑（注册/登录/刷新/用户查询） |
| `JwtService` | JWT 令牌生成、验证、解析 |
| `JwtAuthenticationFilter` | Spring Security 过滤器，从请求头提取并验证 JWT |
| `AuthenticatedUser` | 认证用户主体（实现 UserDetails） |
| `UserRepository` | 用户数据访问（JPA Repository） |
| `User` | 用户实体 |

#### DTO 说明

| DTO | 用途 |
|-----|------|
| `LoginRequest` | 登录请求（email, password） |
| `RegisterRequest` | 注册请求（email, password） |
| `RefreshRequest` | 刷新令牌请求（refreshToken） |
| `TokenResponse` | 令牌响应（accessToken, refreshToken, expiresInSeconds） |
| `UserProfileResponse` | 用户信息响应（id, email, createdAt） |

### 3.3 会话管理模块 (`com.agent.mvp.session`)

**职责**：会话生命周期管理、消息持久化、会话导出。

#### 核心类

| 类名 | 职责 |
|------|------|
| `SessionController` | 会话 REST 端点 |
| `SessionService` | 会话业务逻辑，含 Redis 缓存优化 |
| `ConversationSessionRepository` | 会话数据访问 |
| `MessageRepository` | 消息数据访问 |
| `ConversationSession` | 会话实体 |
| `Message` | 消息实体 |

#### DTO 说明

| DTO | 用途 |
|-----|------|
| `CreateSessionRequest` | 创建会话请求（title?, provider?, model?） |
| `SessionResponse` | 会话响应 |
| `MessageResponse` | 消息响应 |
| `SessionExportResponse` | 会话导出响应（session + messages + exportedAt） |

### 3.4 系统管理模块 (`com.agent.mvp.system`)

**职责**：系统健康检查、模型列表、发布报告、工具统计。

#### 核心类

| 类名 | 职责 |
|------|------|
| `SystemController` | 系统基础端点（models, readiness） |
| `ReleaseReportController` | 发布报告端点（查询/导出） |
| `ToolStatsController` | 工具统计端点（查询/导出） |
| `ReleaseReportService` | 发布报告生成逻辑 |
| `SystemDiagnosticsService` | 系统诊断（健康检查、模型列表） |

#### DTO 说明

| DTO | 用途 |
|-----|------|
| `ModelsResponse` | 模型列表响应 |
| `ModelOption` | 模型选项（provider, model, isDefault） |
| `ReadinessResponse` | 就绪检查响应 |
| `ReadinessCheck` | 单项检查结果（name, ok, detail） |
| `ReleaseReportResponse` | 发布报告响应 |

### 3.5 工具模块 (`com.agent.mvp.tooling`)

**职责**：代码工具实现、工具调用审计。

#### 核心类

| 类名 | 职责 |
|------|------|
| `CodeToolService` | 代码工具实现（搜索/读取/目录/POM 分析） |
| `ToolAuditService` | 工具调用审计与统计 |

#### CodeToolService 提供的工具

| 工具名 | 功能 | 参数 |
|--------|------|------|
| `searchCode` | 使用 ripgrep 搜索代码 | query, glob?, maxResults? |
| `readFile` | 读取工作区文件 | path, startLine?, endLine? |
| `listRepoTree` | 列出目录树 | path?, depth? |
| `analyzePom` | 解析 POM 依赖 | path? |

**安全机制**：所有文件操作都通过 `resolveSafe()` 方法验证路径不会逃逸出 `workspaceRoot`。

### 3.6 公共模块 (`com.agent.mvp.common`)

**职责**：全局异常处理、统一错误响应、请求上下文传递。

#### 核心类

| 类名 | 职责 |
|------|------|
| `ApiExceptionHandler` | 全局异常处理器（@RestControllerAdvice） |
| `RequestContext` | 请求上下文（userId, sessionId, requestId） |
| `RequestContextFilter` | 请求上下文过滤器（生成 requestId） |
| `ErrorResponse` | 统一错误响应格式 |

#### 异常层次

```
ApiException (基类, 500)
├── BadRequestException (400)
├── UnauthorizedException (401)
├── ForbiddenException (403)
├── NotFoundException (404)
└── TooManyRequestsException (429)
```

### 3.7 配置模块 (`com.agent.mvp.config`)

**职责**：应用配置绑定、安全配置、启动校验。

| 类名 | 职责 |
|------|------|
| `AppProperties` | `@ConfigurationProperties(prefix="app")` 配置绑定 |
| `SecurityConfig` | Spring Security 配置（JWT 过滤器链、CORS、CSRF 禁用） |
| `StartupValidationRunner` | 启动时校验模型连接可用性 |

### 3.8 基础设施模块 (`com.agent.mvp.infra`)

**职责**：Redis 缓存和限流服务。

| 类名 | 职责 |
|------|------|
| `RedisRateLimiterService` | 基于 Redis 的固定窗口限流 |
| `RedisSessionCacheService` | 会话消息 Redis 缓存 |

### 3.9 后端最小可运行路径（30 秒）

```bash
cd backend
mvn spring-boot:run
# 默认监听 http://localhost:8080
```

---

## 4. 前端模块详解

> 当前实现：本节组件、Store 与 API 客户端描述基于 `web/src` 当前实现。
> 设计说明：UI 层允许样式和组织方式迭代，但需保持接口契约与状态流一致。

### 4.1 技术架构

前端采用 React 18 + TypeScript + Vite 构建，使用 Zustand 进行状态管理，不使用路由库（单页面多面板切换）。

### 4.2 状态管理 (Zustand Stores)

#### authStore

**文件**: [authStore.ts](web/src/stores/authStore.ts)

| 状态字段 | 类型 | 说明 |
|----------|------|------|
| `user` | `UserProfile \| null` | 当前用户 |
| `tokens` | `Tokens \| null` | 访问令牌 |
| `api` | `ApiClient` | API 客户端实例 |

| 方法 | 说明 |
|------|------|
| `register(email, password)` | 注册并自动登录 |
| `login(email, password)` | 登录获取令牌 |
| `logout()` | 登出清除状态 |
| `loadProfile()` | 加载用户信息 |

#### chatStore

**文件**: [chatStore.ts](web/src/stores/chatStore.ts)

| 状态字段 | 类型 | 说明 |
|----------|------|------|
| `sessions` | `Session[]` | 会话列表 |
| `currentSessionId` | `string \| null` | 当前会话 ID |
| `messages` | `Message[]` | 当前会话消息 |
| `streaming` | `boolean` | 是否正在流式响应 |
| `streamBuffer` | `string` | 流式缓冲区 |
| `error` | `string \| null` | 错误信息 |

| 方法 | 说明 |
|------|------|
| `loadSessions()` | 加载会话列表 |
| `selectSession(id)` | 选择会话并加载消息 |
| `createSession(input)` | 创建新会话 |
| `sendMessage(message)` | 发送消息（流式） |
| `stopStreaming()` | 停止流式响应 |

#### uiStore

**文件**: [uiStore.ts](web/src/stores/uiStore.ts)

| 状态字段 | 类型 | 说明 |
|----------|------|------|
| `models` | `ModelOption[]` | 可用模型列表 |
| `selectedModel` | `string` | 当前选择模型 |
| `toolStats` | `ToolStatsResponse \| null` | 工具统计数据 |
| `mouseFx` | `boolean` | 鼠标特效开关 |

### 4.3 API 客户端

**文件**: [api.ts](web/src/api.ts)

通过 `createApiClient(baseUrl, tokenAccessor)` 工厂函数创建，核心特性：

- **自动令牌刷新**：401 响应时自动使用 refreshToken 获取新令牌并重试
- **SSE 流式解析**：内置 `parseSseStream()` 解析 SSE 事件流
- **统一错误处理**：`toErrorMessage()` 将 API 错误转为友好消息

| API 方法 | 对应端点 |
|----------|----------|
| `register(input)` | POST `/api/auth/register` |
| `login(input)` | POST `/api/auth/login` |
| `me()` | GET `/api/auth/me` |
| `listSessions()` | GET `/api/sessions` |
| `createSession(input)` | POST `/api/sessions` |
| `listMessages(sessionId)` | GET `/api/sessions/{id}/messages` |
| `exportSession(sessionId, format)` | GET `/api/sessions/{id}/export` |
| `chat(input)` | POST `/api/agent/chat` |
| `streamChat(input, handlers)` | POST `/api/agent/chat/stream` |
| `listModels()` | GET `/api/system/models` |
| `toolStats(windowHours, sessionId?)` | GET `/api/system/tool-stats` |
| `exportToolStats(...)` | GET `/api/system/tool-stats/export` |
| `releaseReport(windowHours, sessionId?)` | GET `/api/system/release-report` |
| `exportReleaseReport(...)` | GET `/api/system/release-report/export` |

### 4.4 UI 组件

| 组件 | 文件 | 职责 |
|------|------|------|
| `App` | [App.tsx](web/src/App.tsx) | 主应用组件，整合所有面板 |
| `AuthPanel` | [AuthPanel.tsx](web/src/components/AuthPanel.tsx) | 登录/注册表单 |
| `Sidebar` | [Sidebar.tsx](web/src/components/Sidebar.tsx) | 侧边栏（设置 + 会话列表） |
| `ChatList` | [ChatList.tsx](web/src/components/ChatList.tsx) | 会话列表 |
| `ChatWindow` | [ChatWindow.tsx](web/src/components/ChatWindow.tsx) | 聊天窗口（消息输入 + 发送） |
| `MessageContainer` | [MessageContainer.tsx](web/src/components/MessageContainer.tsx) | 消息列表容器（虚拟滚动） |
| `MessageItem` | [MessageItem.tsx](web/src/components/MessageItem.tsx) | 单条消息渲染（支持 Markdown） |
| `Settings` | [Settings.tsx](web/src/components/Settings.tsx) | 设置面板（模型选择、工具统计、导出） |
| `MouseFx` | [MouseFx.tsx](web/src/components/MouseFx.tsx) | 鼠标跟随特效 |
| `Card` | [Card.tsx](web/src/components/Card.tsx) | 通用卡片容器 |
| `LoadingSpinner` | [LoadingSpinner.tsx](web/src/components/LoadingSpinner.tsx) | 加载动画 |
| `Skeleton` | [Skeleton.tsx](web/src/components/Skeleton.tsx) | 骨架屏 |

### 4.5 TypeScript 类型定义

**文件**: [types.ts](web/src/types.ts)

| 类型 | 说明 |
|------|------|
| `Provider` | 模型提供商类型（`'OPENAI'`） |
| `ApiError` | API 错误响应 |
| `Tokens` | 令牌对（accessToken, refreshToken, expiresInSeconds） |
| `UserProfile` | 用户信息 |
| `Session` | 会话信息 |
| `Message` | 消息信息 |
| `ChatResponse` | 对话响应 |
| `ModelsResponse` | 模型列表 |
| `ToolStatsResponse` | 工具统计 |
| `ReleaseReportResponse` | 发布报告 |
| `SessionExportResponse` | 会话导出 |

### 4.6 前端最小可运行路径（30 秒）

```bash
cd web
npm install
npm run dev
# 浏览器打开 http://localhost:5173
```

---

## 5. CLI 模块详解

> 当前实现：命令与参数来自 `cli` 模块现有命令定义。
> 设计说明：命令名与输出格式优先保持向后兼容。

### 5.1 概述

CLI 模块是一个基于 Picocli 的命令行工具，允许用户通过终端与后端 API 交互。

**入口类**: [AgentCliApplication.java](cli/src/main/java/com/agent/cli/AgentCliApplication.java)

### 5.2 命令列表

| 命令 | 类 | 功能 |
|------|-----|------|
| `login` | [LoginCommand](cli/src/main/java/com/agent/cli/cmd/LoginCommand.java) | 用户登录，保存令牌到本地 |
| `sessions` | [SessionsCommand](cli/src/main/java/com/agent/cli/cmd/SessionsCommand.java) | 列出所有会话 |
| `create-session` | [CreateSessionCommand](cli/src/main/java/com/agent/cli/cmd/CreateSessionCommand.java) | 创建新会话 |
| `chat` | [ChatCommand](cli/src/main/java/com/agent/cli/cmd/ChatCommand.java) | 同步对话 |
| `stream-chat` | [StreamChatCommand](cli/src/main/java/com/agent/cli/cmd/StreamChatCommand.java) | 流式对话（SSE） |
| `tool-stats` | [ToolStatsCommand](cli/src/main/java/com/agent/cli/cmd/ToolStatsCommand.java) | 查看工具统计 |
| `release-report` | [ReleaseReportCommand](cli/src/main/java/com/agent/cli/cmd/ReleaseReportCommand.java) | 获取发布报告 |

### 5.3 核心类

| 类 | 职责 |
|-----|------|
| `ApiClient` | HTTP 客户端，支持 GET/POST/SSE 流式请求，含自动令牌刷新 |
| `CliStateStore` | 本地状态持久化（令牌存储到文件） |
| `AuthState` | 认证状态模型（accessToken, refreshToken） |

### 5.4 CLI 使用示例

```bash
# 登录
java -jar cli.jar login --email user@example.com --password Passw0rd!

# 创建会话
java -jar cli.jar create-session --title "My Session" --provider OPENAI --model qwen/qwen3.5-9b

# 同步对话
java -jar cli.jar chat --session-id <uuid> --message "Hello"

# 流式对话
java -jar cli.jar stream-chat --session-id <uuid> --message "Hello"

# 查看工具统计
java -jar cli.jar tool-stats --window-hours 24

# 获取发布报告
java -jar cli.jar release-report --window-hours 24
```

### 5.5 CLI 最小可运行路径（30 秒）

```bash
cd cli
mvn -q exec:java -Dexec.args="login --email <email> --password <password> --base-url http://localhost:8080"
mvn -q exec:java -Dexec.args="create-session --provider OPENAI --model qwen/qwen3.5-9b"
mvn -q exec:java -Dexec.args="chat --session-id <uuid> --message 'Hello'"
```

---

## 6. Desktop 桌面客户端模块详解

> 当前实现：本节基于 `desktop/` 模块的 Electron 主进程、预加载脚本与打包配置的当前实现。
> 设计说明：Desktop 模块是独立于 Docker 部署的本地桌面方案，通过 Electron 打包内嵌 JRE + 后端 JAR，实现一键启动。

### 6.1 概述

Desktop 模块是一个基于 **Electron 33** 的桌面客户端，它将 Spring Boot 后端内嵌到 Electron 应用中，提供原生桌面体验。主要能力包括：

- **内嵌后端**：Electron 主进程通过 `child_process.spawn()` 启动 Java 后端 JAR
- **内嵌 CLI**：可通过 IPC 调用 CLI JAR 执行命令
- **系统托盘**：提供快捷菜单（显示窗口/重启后端/退出）
- **单实例锁**：`app.requestSingleInstanceLock()` 防止重复启动
- **上下文隔离**：通过 `contextBridge` 暴露安全的 API 给渲染进程
- **跨平台打包**：支持 macOS（dmg/zip）和 Windows（nsis/portable）

### 6.2 技术架构

| 层级 | 技术选型 | 版本 |
|------|----------|------|
| 桌面框架 | Electron | 33.2.0 |
| 打包工具 | electron-builder | 25.1.8 |
| 后端进程管理 | Node.js child_process (spawn) | - |
| IPC 通信 | Electron ipcMain / ipcRenderer | - |
| 本地存储 | electron-store | 8.2.0 |
| 编程语言 | TypeScript | 5.5.4 |

### 6.3 核心文件结构

```
desktop/
├── src/
│   ├── main/
│   │   ├── index.ts              # 应用入口，管理窗口/托盘/IPC
│   │   ├── backend-manager.ts    # Java 后端进程生命周期管理
│   │   └── cli-manager.ts        # CLI 命令执行管理
│   └── preload/
│       └── index.ts              # contextBridge 安全暴露 API
├── scripts/
│   ├── build-all.sh              # 全量构建（JRE + 后端 + CLI + Web）
│   ├── build-backend.sh          # 构建后端 JAR
│   └── build-jre.sh              # 使用 jlink 裁剪 JRE
├── resources/
│   └── entitlements.mac.plist    # macOS 签名权限配置
├── package.json                  # NPM 配置与脚本
├── electron-builder.yml          # Electron 打包配置
└── tsconfig.main.json            # TypeScript 编译配置
```

### 6.4 核心类详解

#### 6.4.1 index.ts — 应用入口

**文件**: [index.ts](desktop/src/main/index.ts)

**职责**: Electron 应用生命周期管理、窗口创建、系统托盘、IPC 通道注册。

| 功能 | 说明 |
|------|------|
| `createMainWindow()` | 创建 BrowserWindow（1280×800，最小 900×600），启用 contextIsolation |
| `createTray()` | 创建系统托盘菜单（显示窗口/打开数据目录/重启后端/退出） |
| `setupIpc()` | 注册 6 个 IPC 通道（backend:status, backend:restart, app:version, app:data-dir, app:open-data-dir, cli:execute, cli:input） |
| 单实例锁 | `app.requestSingleInstanceLock()` 确保只有一个实例运行 |
| 生命周期 | `before-quit` 时自动停止后端进程和 CLI 进程 |

**关键常量**:
- `DESKTOP_PORT = 18080` — 内嵌后端监听端口（区别于 Docker 部署的 8080）
- 资源路径解析：`getResourcePath()` → `getJrePath()` → `getBackendJarPath()` → `getCliJarPath()`
- 数据目录：`app.getPath('userData') + '/data'`

**开发模式 vs 生产模式**:
- 开发模式 (`!app.isPackaged`)：加载 `http://localhost:5173`（Vite 开发服务器），打开 DevTools
- 生产模式：加载 `dist/renderer/index.html`（Web 构建产物）

#### 6.4.2 BackendManager — 后端进程管理

**文件**: [backend-manager.ts](desktop/src/main/backend-manager.ts)

**职责**: 管理 Java 后端进程的启动、停止、重启和健康检查。

| 方法 | 说明 |
|------|------|
| `start()` | 使用 `spawn(jrePath, ['-jar', jarPath, '--spring.profiles.active=desktop', ...])` 启动后端，激活 `desktop` profile，等待就绪（最多 60s） |
| `stop()` | 先发送 SIGTERM，10s 超时后强制 SIGKILL |
| `restart()` | `stop()` → `start()` |
| `getStatus()` | 返回 `{ status, port, logs }`（含最近 500 条日志） |
| `waitForReady(timeoutMs)` | 轮询 `/api/system/health/ready`（每秒一次，3s 超时），直到返回 200 |

**后端启动参数**:
```
-jar backend.jar
--spring.profiles.active=desktop
--server.port=18080
--app.data-dir=<userData>/data
```

**状态机**: `stopped` → `starting` → `running` / `error` → `stopped`

#### 6.4.3 CliManager — CLI 进程管理

**文件**: [cli-manager.ts](desktop/src/main/cli-manager.ts)

**职责**: 管理 CLI JAR 的执行，支持并发控制和 stdin 输入。

| 方法 | 说明 |
|------|------|
| `execute(jrePath, cliJarPath, args)` | 执行 CLI 命令，收集 stdout/stderr 输出，返回 `{ exitCode, output }` |
| `sendInput(input)` | 向活跃的 CLI 进程发送 stdin 输入（用于交互式命令） |
| `killAll()` | 终止所有活跃的 CLI 进程 |

**并发控制**: 同一时间只允许一个 CLI 命令执行，重复调用返回错误。

#### 6.4.4 preload/index.ts — 预加载脚本

**文件**: [preload/index.ts](desktop/src/preload/index.ts)

**职责**: 通过 `contextBridge.exposeInMainWorld` 向渲染进程暴露安全的 API。

暴露的 API（挂载到 `window.electronAPI`）:
- `getBackendStatus()` — 获取后端状态
- `restartBackend()` — 重启后端
- `getAppVersion()` — 获取应用版本
- `getDataDir()` — 获取数据目录路径
- `openDataDir()` — 打开数据目录
- `executeCli(args)` — 执行 CLI 命令
- `sendCliInput(input)` — 向 CLI 发送输入
- `onBackendStatusChanged(callback)` — 监听后端状态变化

### 6.5 打包与分发

**配置文件**: [electron-builder.yml](desktop/electron-builder.yml)

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `appId` | `com.ai-agent.desktop` | 应用唯一标识 |
| `productName` | `AI Agent` | 产品名称 |
| `directories.output` | `release` | 构建输出目录 |
| `asar` | `true` | 启用 asar 打包 |
| `extraResources` | `backend-jre/**/*` | 将 JRE + JAR 作为额外资源打包 |

**平台支持**:
| 平台 | 格式 | 说明 |
|------|------|------|
| macOS | dmg, zip | `hardenedRuntime: true`，需签名权限 |
| Windows | nsis, portable | x64 架构，支持自定义安装目录 |
| Linux | AppImage | - |

**构建命令**:
```bash
cd desktop

# 开发模式
npm run dev

# 构建主进程 TypeScript
npm run build:main

# 构建 Web 前端并复制到 renderer
npm run build:web

# 全量构建
npm run build

# 打包（不压缩）
npm run pack

# 分发生成安装包
npm run dist          # 当前平台
npm run dist:mac      # macOS
npm run dist:win      # Windows
```

**构建脚本**:
| 脚本 | 用途 |
|------|------|
| [build-jre.sh](desktop/scripts/build-jre.sh) | 使用 `jlink` 裁剪 JRE（仅包含必要模块） |
| [build-backend.sh](desktop/scripts/build-backend.sh) | 构建 backend.jar 和 cli.jar |
| [build-all.sh](desktop/scripts/build-all.sh) | 串联 JRE + 后端 + Web + Electron 全量构建 |

### 6.6 Desktop 启动流程

```
┌──────────────────────────────────────────────────────┐
│                  Electron App 启动                     │
│                                                      │
│  1. app.requestSingleInstanceLock()                  │
│  2. app.whenReady()                                  │
│  3. createMainWindow()  → BrowserWindow 创建          │
│  4. createTray()        → 系统托盘菜单                 │
│  5. setupIpc()          → IPC 通道注册                │
│  6. backendManager.start()                           │
│     ├─ spawn JRE + backend.jar (port 18080)           │
│     ├─ 激活 desktop profile                          │
│     └─ 轮询 /api/system/health/ready (最多 60s)       │
│  7. mainWindow.loadURL/loadFile()                    │
│     ├─ 开发: http://localhost:5173                   │
│     └─ 生产: dist/renderer/index.html                │
│  8. 后端就绪后发送 backend:status-changed 事件         │
└──────────────────────────────────────────────────────┘
```

### 6.7 Desktop 与 Docker 部署的差异

| 方面 | Desktop 模式 | Docker 模式 |
|------|-------------|-------------|
| 后端端口 | 18080 | 8080 |
| 数据库 | 内嵌 H2（`application-desktop.yml`） | 外部 PostgreSQL |
| Redis | 不需要（使用 Caffeine 替代） | 外部 Redis 容器 |
| Spring Profile | `desktop` | 默认（无额外 profile） |
| 前端 API 地址 | `http://localhost:18080` | `/api`（Nginx 反向代理） |
| 数据目录 | `<userData>/data` | `/app/workspace` |

---

## 7. 关键类与函数说明

> 当前实现：方法签名、常量和约束均来自当前源码。
> 设计说明：这里描述的是稳定能力边界，不限制具体内部实现方式。

### 7.1 AgentService

**文件**: [AgentService.java](backend/src/main/java/com/agent/mvp/agent/service/AgentService.java)

**职责**: Agent 对话的核心业务逻辑，实现 ReAct 循环。

| 方法签名 | 说明 |
|----------|------|
| `ChatResponse chat(UUID userId, ChatRequest request)` | 同步对话处理 |
| `ChatResponse streamChat(UUID userId, ChatRequest request, Consumer<ChatStreamMeta> metaConsumer, Consumer<String> chunkConsumer)` | 流式对话处理 |
| `AgentLoopResult executeLoop(UUID userId, ConversationSession session, ResolvedModelConfig resolved, Consumer<String> chunkConsumer)` | Agent 循环执行（私有） |
| `List<ModelChatMessage> buildMessages(List<MessageResponse> history)` | 构建模型消息上下文 |
| `List<ModelChatMessage> sliceByTokenBudget(List<MessageResponse> history, int maxTokens)` | 按 Token 预算裁剪历史消息 |
| `int estimateTokens(String text)` | 估算文本 Token 数 |

**关键常量**:
- `MAX_CONTEXT_TOKENS = 6_000` — 最大上下文 Token 预算
- `MAX_TOOL_STEPS = 4` — 最大工具调用轮次

### 7.2 OpenAiModelProvider

**文件**: [OpenAiModelProvider.java](backend/src/main/java/com/agent/mvp/agent/provider/OpenAiModelProvider.java)

**职责**: 与 OpenAI 兼容 API 通信，处理同步和流式请求。

| 方法签名 | 说明 |
|----------|------|
| `ModelProviderType type()` | 返回 OPENAI |
| `ModelChatResponse chat(ModelChatRequest request)` | 同步调用 /chat/completions |
| `ModelChatResponse stream(ModelChatRequest request, Consumer<String> chunkConsumer)` | 流式调用 /chat/completions |

**关键特性**:
- 使用 Reactor Netty WebClient 进行 HTTP 通信
- 支持幂等重试（408/429/5xx 自动重试，指数退避）
- 流式响应解析 `delta.content` 和 `delta.reasoning_content`
- 请求超时配置：connect / read / total 三级超时

### 7.3 AgentToolOrchestrator

**文件**: [AgentToolOrchestrator.java](backend/src/main/java/com/agent/mvp/agent/tooling/AgentToolOrchestrator.java)

**职责**: 为 Agent 准备工具定义并执行工具调用。

| 方法签名 | 说明 |
|----------|------|
| `List<ToolSpec> listToolSpecs()` | 返回所有可用工具的规范定义 |
| `ToolResult execute(ToolCall call)` | 根据工具名路由执行并返回结果 |

**注册的工具**:

| 工具名 | 描述 | 参数 Schema |
|--------|------|-------------|
| `searchCode` | 正则搜索源码 | query(string), glob(string), maxResults(integer) |
| `readFile` | 读取文件内容 | path(string), startLine(integer), endLine(integer) |
| `listRepoTree` | 列出目录树 | path(string), depth(integer) |
| `analyzePom` | 解析 POM 依赖 | path(string) |

### 7.4 AuthService

**文件**: [AuthService.java](backend/src/main/java/com/agent/mvp/auth/service/AuthService.java)

**职责**: 用户认证与授权业务逻辑。

| 方法签名 | 说明 |
|----------|------|
| `UserProfileResponse register(String email, String password)` | 用户注册（密码强度校验 + BCrypt 哈希） |
| `TokenResponse login(LoginRequest request)` | 用户登录（返回 accessToken + refreshToken） |
| `TokenResponse refresh(String refreshToken)` | 刷新令牌（Refresh Token 轮转机制） |
| `UserProfileResponse me(AuthenticatedUser user)` | 获取当前用户信息 |

**密码强度要求**: 最少 8 位，包含大写字母、小写字母、数字、特殊字符。

### 7.5 JwtService

**文件**: [JwtService.java](backend/src/main/java/com/agent/mvp/auth/service/JwtService.java)

**职责**: JWT 令牌的生成、验证与解析。

| 方法签名 | 说明 |
|----------|------|
| `String generateAccessToken(UUID userId, String email)` | 生成访问令牌（默认 1 小时） |
| `String generateRefreshToken(UUID userId)` | 生成刷新令牌（默认 30 天） |
| `UUID parseUserId(String token)` | 从令牌解析用户 ID |
| `boolean validate(String token)` | 验证令牌有效性 |

### 7.6 SessionService

**文件**: [SessionService.java](backend/src/main/java/com/agent/mvp/session/service/SessionService.java)

**职责**: 会话与消息管理。

| 方法签名 | 说明 |
|----------|------|
| `SessionResponse createSession(UUID userId, CreateSessionRequest request)` | 创建新会话 |
| `List<SessionResponse> listSessions(UUID userId)` | 列出用户所有会话 |
| `ConversationSession findOwnedSession(UUID userId, UUID sessionId)` | 查找并验证会话归属 |
| `List<MessageResponse> listMessages(UUID userId, UUID sessionId)` | 获取会话消息（含 Redis 缓存） |
| `List<MessageResponse> listRecentMessages(UUID userId, UUID sessionId, int limit)` | 获取最近 N 条消息 |
| `void saveMessage(ConversationSession session, String role, String content, String toolTrace, String provider, String model)` | 保存消息 |
| `SessionExportResponse exportSession(UUID userId, UUID sessionId)` | 导出会话（JSON） |
| `String exportSessionMarkdown(UUID userId, UUID sessionId)` | 导出会话（Markdown） |

### 7.7 CodeToolService

**文件**: [CodeToolService.java](backend/src/main/java/com/agent/mvp/tooling/service/CodeToolService.java)

**职责**: 代码工具的具体实现。

| 方法签名 | 说明 |
|----------|------|
| `ToolCallOutput searchCode(String query, String glob, int maxResults)` | 使用 ripgrep 搜索代码（8s 超时） |
| `ToolCallOutput readFile(String relativePath, Integer startLine, Integer endLine)` | 读取文件（最多 400 行） |
| `ToolCallOutput listRepoTree(String relativePath, int depth)` | 列出目录树（最大深度 5，最多 500 条） |
| `ToolCallOutput analyzePom(String relativePath)` | 解析 POM 依赖（正则提取） |

**安全约束**: `resolveSafe()` 确保所有路径操作不超出 `workspaceRoot`。

### 7.8 ToolAuditService

**文件**: [ToolAuditService.java](backend/src/main/java/com/agent/mvp/tooling/service/ToolAuditService.java)

**职责**: 工具调用审计与统计。

| 方法签名 | 说明 |
|----------|------|
| `void saveAll(UUID userId, UUID sessionId, String provider, String model, List<ToolExecutionResult> traces)` | 批量保存审计记录 |
| `ToolStatsResponse stats(UUID userId, int windowHours, UUID sessionId)` | 获取工具统计 |
| `String statsMarkdown(UUID userId, int windowHours, UUID sessionId)` | 获取工具统计（Markdown 格式） |

### 7.9 RedisRateLimiterService

**文件**: [RedisRateLimiterService.java](backend/src/main/java/com/agent/mvp/infra/RedisRateLimiterService.java)

**职责**: 基于 Redis 的固定窗口速率限制。

| 方法签名 | 说明 |
|----------|------|
| `boolean allow(String key, long limit, Duration window)` | 判断请求是否允许通过 |

### 7.10 AppProperties

**文件**: [AppProperties.java](backend/src/main/java/com/agent/mvp/config/AppProperties.java)

**职责**: 绑定 `app.*` 前缀的配置属性。

| 嵌套类 | 配置前缀 | 说明 |
|--------|----------|------|
| `Openai` | `app.openai` | OpenAI 连接配置（baseUrl, apiKey） |
| `Cors` | `app.cors` | CORS 配置（allowedOrigins） |
| `ModelRuntime` | `app.model-runtime` | 模型运行时配置（超时、重试） |
| `RateLimit` | `app.rate-limit` | 速率限制配置 |
| `StartupValidation` | `app.startup-validation` | 启动校验配置 |

---

## 8. 数据模型与数据库

### 8.1 数据库表结构

#### users 表

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | UUID | PK | 用户 ID |
| email | VARCHAR(255) | UNIQUE NOT NULL | 用户邮箱 |
| password_hash | VARCHAR(255) | NOT NULL | BCrypt 密码哈希 |
| created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| token_version | INTEGER | DEFAULT 0 | 令牌版本（V2 迁移添加） |

#### conversation_sessions 表

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | UUID | PK | 会话 ID |
| user_id | UUID | FK → users(id) NOT NULL | 所属用户 |
| title | VARCHAR(120) | NOT NULL | 会话标题 |
| provider | VARCHAR(32) | NOT NULL | 模型提供商 |
| model | VARCHAR(128) | NOT NULL | 模型名称 |
| created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |

**索引**: `idx_sessions_user_updated` (user_id, updated_at DESC)

#### messages 表

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | UUID | PK | 消息 ID |
| session_id | UUID | FK → conversation_sessions(id) NOT NULL | 所属会话 |
| role | VARCHAR(32) | NOT NULL | 角色（user/assistant/tool） |
| content | TEXT | NOT NULL | 消息内容 |
| tool_trace | TEXT | NULL | 工具调用追踪 JSON |
| provider | VARCHAR(32) | NOT NULL | 模型提供商 |
| model | VARCHAR(128) | NOT NULL | 模型名称 |
| created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |

**索引**: `idx_messages_session_created` (session_id, created_at)

#### tool_audits 表

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | UUID | PK | 审计 ID |
| user_id | UUID | NOT NULL | 用户 ID |
| session_id | UUID | NOT NULL | 会话 ID |
| tool_name | VARCHAR(120) | NOT NULL | 工具名称 |
| args_json | TEXT | NULL | 工具参数 JSON |
| status | VARCHAR(32) | NOT NULL | 执行状态（SUCCESS/ERROR） |
| duration_ms | BIGINT | NOT NULL | 执行耗时（毫秒） |
| provider | VARCHAR(32) | NOT NULL | 模型提供商 |
| model | VARCHAR(128) | NOT NULL | 模型名称 |
| created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |

**索引**: `idx_tool_audits_session_created` (session_id, created_at)

### 8.2 Flyway 迁移

| 版本 | 文件 | 内容 |
|------|------|------|
| V1 | [V1__init_schema.sql](backend/src/main/resources/db/migration/V1__init_schema.sql) | 初始表结构（users, conversation_sessions, messages, tool_audits） |
| V2 | [V2__refresh_token_rotation.sql](backend/src/main/resources/db/migration/V2__refresh_token_rotation.sql) | 添加 token_version 字段支持 Refresh Token 轮转 |

### 8.3 实体与表映射

| 实体类 | 表名 | 仓库接口 |
|--------|------|----------|
| `User` | users | `UserRepository` |
| `ConversationSession` | conversation_sessions | `ConversationSessionRepository` |
| `Message` | messages | `MessageRepository` |
| `ToolAudit` | tool_audits | `ToolAuditRepository` |

---

## 9. REST API 接口

### 9.1 认证接口 (`/api/auth`)

| 方法 | 路径 | 描述 | 认证 | 速率限制 |
|------|------|------|------|----------|
| POST | `/api/auth/register` | 用户注册 | 否 | IP + Email, 10次/分 |
| POST | `/api/auth/login` | 用户登录 | 否 | IP + Email, 20次/分 |
| POST | `/api/auth/refresh` | 刷新令牌 | 否 | IP, 60次/分 |
| GET | `/api/auth/me` | 获取当前用户 | Access Token | - |

**请求/响应示例**:

```json
// POST /api/auth/register
// Request:
{ "email": "user@example.com", "password": "Passw0rd!" }
// Response:
{ "id": "uuid", "email": "user@example.com", "createdAt": "2026-01-01T00:00:00Z" }

// POST /api/auth/login
// Request:
{ "email": "user@example.com", "password": "Passw0rd!" }
// Response:
{ "accessToken": "eyJ...", "refreshToken": "eyJ...", "expiresInSeconds": 3600 }
```

### 9.2 会话接口 (`/api/sessions`)

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/sessions` | 创建会话 | Access Token |
| GET | `/api/sessions` | 列出会话 | Access Token |
| GET | `/api/sessions/{id}/messages` | 获取消息列表 | Access Token |
| GET | `/api/sessions/{id}/export?format=json\|markdown` | 导出会话 | Access Token |

### 9.3 Agent 接口 (`/api/agent`)

| 方法 | 路径 | 描述 | 认证 | 速率限制 |
|------|------|------|------|----------|
| POST | `/api/agent/chat` | 同步对话 | Access Token | 60次/分 (Premium 120次/分) |
| POST | `/api/agent/chat/stream` | 流式对话 (SSE) | Access Token | 60次/分 (Premium 120次/分) |

**SSE 事件类型**:

| 事件名 | 数据类型 | 描述 |
|--------|----------|------|
| `meta` | ChatStreamMeta | 流开始元数据（sessionId, provider, model） |
| `chunk` | String | 文本片段 |
| `heartbeat` | `{ ts: ISO8601 }` | 心跳保活（10s 间隔） |
| `done` | ChatResponse | 完整响应 |
| `error` | `{ message: String }` | 错误信息 |

### 9.4 系统接口 (`/api/system`)

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/system/models` | 获取可用模型列表 | Access Token |
| GET | `/api/system/health/ready` | 就绪检查 | 否 |
| GET | `/api/system/tool-stats?windowHours=24&sessionId=` | 工具统计 | Access Token |
| GET | `/api/system/tool-stats/export?windowHours=24&format=json\|markdown` | 导出工具统计 | Access Token |
| GET | `/api/system/release-report?windowHours=24&sessionId=` | 发布报告 | Access Token |
| GET | `/api/system/release-report/export?windowHours=24&format=json\|markdown` | 导出发布报告 | Access Token |

### 9.5 Actuator 端点

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/actuator/health` | 健康检查 | 否 |

### 8.6 统一错误响应格式

```json
{
  "code": "BAD_REQUEST",
  "message": "具体错误描述",
  "requestId": "uuid",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

| HTTP 状态码 | code | 说明 |
|-------------|------|------|
| 400 | BAD_REQUEST | 请求参数错误 |
| 401 | UNAUTHORIZED | 未认证 |
| 403 | FORBIDDEN | 无权限 |
| 404 | NOT_FOUND | 资源不存在 |
| 429 | TOO_MANY_REQUESTS | 请求频率超限 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

### 9.7 常见失败场景示例

```json
// 401 UNAUTHORIZED（访问受保护接口但未携带/携带无效令牌）
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required",
  "requestId": "0f2ce8da-8ef4-4be4-8cae-57acda9f87a9",
  "timestamp": "2026-05-01T09:00:00Z"
}
```

```json
// 429 TOO_MANY_REQUESTS（聊天接口限流）
{
  "code": "TOO_MANY_REQUESTS",
  "message": "Too many requests",
  "requestId": "61a65cd7-fb77-41dd-bf03-f9afbff87d2e",
  "timestamp": "2026-05-01T09:01:00Z"
}
```

```json
// 500 INTERNAL_ERROR（服务内部错误）
{
  "code": "INTERNAL_ERROR",
  "message": "Internal server error",
  "requestId": "6ba16a0c-5f83-4c52-90ab-4d94cc7e7f0a",
  "timestamp": "2026-05-01T09:02:00Z"
}
```

---

## 10. 依赖关系

### 10.1 后端 Maven 依赖

**文件**: [backend/pom.xml](backend/pom.xml)

| 依赖 | 版本 | 用途 |
|------|------|------|
| spring-boot-starter-web | 3.3.2 | REST API（Spring MVC） |
| spring-boot-starter-webflux | 3.3.2 | 响应式 Web（WebClient, SSE 流式） |
| spring-boot-starter-security | 3.3.2 | 安全框架（JWT 过滤器链） |
| spring-boot-starter-validation | 3.3.2 | Bean Validation（@Valid） |
| spring-boot-starter-actuator | 3.3.2 | 监控端点（health, metrics, prometheus） |
| spring-boot-starter-data-jpa | 3.3.2 | JPA / Hibernate ORM |
| spring-boot-starter-data-redis | 3.3.2 | Redis 集成 |
| netty-resolver-dns-native-macos | - | macOS ARM64 DNS 解析（开发环境） |
| flyway-core | 10.22.0 | 数据库迁移 |
| flyway-database-postgresql | 10.22.0 | PostgreSQL Flyway 支持 |
| postgresql | - | PostgreSQL JDBC 驱动 |
| jjwt-api / jjwt-impl / jjwt-jackson | 0.12.6 | JWT 令牌处理 |

**测试依赖**:

| 依赖 | 用途 |
|------|------|
| spring-boot-starter-test | 测试框架 |
| testcontainers (junit-jupiter, postgresql) | 容器化集成测试 |
| wiremock-jre8 | HTTP Mock |

### 10.2 前端 NPM 依赖

**文件**: [web/package.json](web/package.json)

| 依赖 | 版本 | 用途 |
|------|------|------|
| react | 18.3.1 | UI 框架 |
| react-dom | 18.3.1 | DOM 渲染 |
| react-markdown | 10.1.0 | Markdown 渲染 |
| remark-gfm | 4.0.1 | GitHub Flavored Markdown |
| react-virtuoso | 4.18.6 | 虚拟滚动列表 |
| zustand | 5.0.12 | 轻量状态管理 |
| lucide-react | 1.8.0 | 图标库 |
| vite | 5.4.2 | 构建工具 |
| typescript | 5.5.4 | 类型系统 |
| @vitejs/plugin-react | 4.3.1 | Vite React 插件 |

### 10.3 CLI Maven 依赖

**文件**: [cli/pom.xml](cli/pom.xml)

| 依赖 | 版本 | 用途 |
|------|------|------|
| picocli | 4.7.6 | 命令行框架 |
| jackson-databind | - | JSON 序列化/反序列化 |

### 10.4 Desktop NPM 依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| electron | 33.2.0 | 桌面应用框架 |
| electron-builder | 25.1.8 | 打包分发工具 |
| electron-store | 8.2.0 | 本地持久化存储 |
| typescript | 5.5.4 | 类型系统 |

### 10.5 模块间依赖关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        Controller 层                             │
│  AgentController → AgentService, RedisRateLimiterService        │
│  AuthController  → AuthService, RedisRateLimiterService         │
│  SessionController → SessionService                             │
│  SystemController → SystemDiagnosticsService                    │
│  ReleaseReportController → ReleaseReportService                 │
│  ToolStatsController → ToolAuditService                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                         Service 层                               │
│  AgentService → SessionService, ModelRoutingService,            │
│                 ModelGateway, AgentToolOrchestrator,             │
│                 ToolAuditService                                 │
│  AuthService → UserRepository, JwtService, PasswordEncoder      │
│  SessionService → ConversationSessionRepository,                │
│                   MessageRepository, RedisSessionCacheService    │
│  AgentToolOrchestrator → CodeToolService                        │
│  CodeToolService → AppProperties                                │
│  ToolAuditService → ToolAuditRepository                         │
│  ReleaseReportService → ToolAuditService, SystemDiagnosticsService│
│  SystemDiagnosticsService → AppProperties, ModelGateway         │
│  ModelRoutingService → AppProperties                            │
│  ModelGateway → ModelProvider (OpenAiModelProvider)             │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  Repository / Provider / Infra 层                │
│  OpenAiModelProvider → AppProperties, WebClient                 │
│  RedisRateLimiterService → RedisTemplate                        │
│  RedisSessionCacheService → RedisTemplate                       │
│  UserRepository → JPA / PostgreSQL                              │
│  ConversationSessionRepository → JPA / PostgreSQL               │
│  MessageRepository → JPA / PostgreSQL                           │
│  ToolAuditRepository → JPA / PostgreSQL                         │
└─────────────────────────────────────────────────────────────────┘
```

### 10.6 服务间依赖（Docker Compose）

```
web → backend → postgres
              → redis
              → OpenAI API (外部)
```

---

## 11. 配置参数

### 11.1 应用配置 (`application.yml`)

| 配置项 | 环境变量 | 默认值 | 说明 |
|--------|----------|--------|------|
| `server.port` | SERVER_PORT | 8080 | 服务端口 |
| `spring.datasource.url` | DATABASE_URL / PG_HOST / PG_PORT / PG_DATABASE | localhost:5432/ai_agent | 数据库连接 |
| `spring.datasource.username` | PG_USERNAME | postgres | 数据库用户名 |
| `spring.datasource.password` | PG_PASSWORD | - | 数据库密码 |
| `spring.jpa.hibernate.ddl-auto` | - | validate | DDL 策略（仅验证） |
| `spring.flyway.enabled` | - | true | 启用 Flyway |
| `spring.data.redis.host` | REDIS_HOST | localhost | Redis 主机 |
| `spring.data.redis.port` | REDIS_PORT | 6379 | Redis 端口 |
| `spring.data.redis.password` | REDIS_PASSWORD | - | Redis 密码 |

### 11.2 安全配置

| 配置项 | 环境变量 | 默认值 | 说明 |
|--------|----------|--------|------|
| `security.jwt.secret` | JWT_SECRET | - | JWT 签名密钥（必填） |
| `security.jwt.access-exp-seconds` | JWT_ACCESS_EXP_SECONDS | 3600 | 访问令牌有效期（秒） |
| `security.jwt.refresh-exp-seconds` | JWT_REFRESH_EXP_SECONDS | 2592000 | 刷新令牌有效期（秒） |

### 11.3 应用运行时配置 (`app.*`)

| 配置项 | 环境变量 | 默认值 | 说明 |
|--------|----------|--------|------|
| `app.default-provider` | MODEL_PROVIDER | OPENAI | 默认模型提供商 |
| `app.default-openai-model` | OPENAI_MODEL | qwen/qwen3.5-9b | 默认模型 |
| `app.workspace-root` | WORKSPACE_ROOT | . | 工作区根目录 |
| `app.openai.base-url` | OPENAI_BASE_URL | http://10.115.10.220:1234/v1 | OpenAI API 地址 |
| `app.openai.api-key` | OPENAI_API_KEY | sk-placeholder | OpenAI API 密钥 |
| `app.cors.allowed-origins` | CORS_ALLOWED_ORIGINS | http://localhost:5173 | CORS 允许源 |
| `app.model-runtime.connect-timeout-ms` | MODEL_CONNECT_TIMEOUT_MS | 5000 | 连接超时 |
| `app.model-runtime.read-timeout-ms` | MODEL_READ_TIMEOUT_MS | 45000 | 读取超时 |
| `app.model-runtime.total-timeout-ms` | MODEL_TOTAL_TIMEOUT_MS | 300000 | 总超时 |
| `app.model-runtime.idempotent-retries` | MODEL_IDEMPOTENT_RETRIES | 1 | 幂等重试次数 |
| `app.rate-limit.login-per-minute` | LOGIN_RATE_LIMIT_PER_MIN | 20 | 登录限流 |
| `app.rate-limit.register-per-minute` | REGISTER_RATE_LIMIT_PER_MIN | 10 | 注册限流 |
| `app.rate-limit.refresh-per-minute` | REFRESH_RATE_LIMIT_PER_MIN | 60 | 刷新限流 |
| `app.rate-limit.chat-per-minute` | CHAT_RATE_LIMIT_PER_MIN | 60 | 聊天限流 |
| `app.rate-limit.chat-premium-per-minute` | CHAT_PREMIUM_RATE_LIMIT_PER_MIN | 120 | 高级用户聊天限流 |
| `app.rate-limit.premium-email-suffixes` | CHAT_PREMIUM_EMAIL_SUFFIXES | - | 高级用户邮箱后缀 |
| `app.startup-validation.fail-fast` | STARTUP_VALIDATION_FAIL_FAST | true | 启动校验失败是否中止 |
| `app.startup-validation.model-probe-timeout-ms` | MODEL_PROBE_TIMEOUT_MS | 3000 | 模型探测超时 |
| `app.startup-validation.model-probe-retries` | MODEL_PROBE_RETRIES | 1 | 模型探测重试 |

### 11.4 系统限制与默认值

| 项目 | 默认值 | 来源 | 说明 |
|------|--------|------|------|
| 上下文 Token 预算 | `6000` | `AgentService.MAX_CONTEXT_TOKENS` | 历史消息裁剪上限（估算值） |
| 工具调用最大轮次 | `4` | `AgentService.MAX_TOOL_STEPS` | ReAct 循环最多执行 4 步 |
| 文件读取最大行数 | `400` | `CodeToolService.MAX_READ_LINES` | `readFile` 返回内容上限 |
| 目录树最大深度 | `5` | `CodeToolService.listRepoTree` | 目录遍历深度上限 |
| 目录树最大条数 | `500` | `CodeToolService.listRepoTree` | 目录遍历结果条数上限 |
| 代码搜索超时 | `8s` | `CodeToolService.searchCode` | 超时后返回错误 |
| SSE 心跳间隔 | `10s` | `AgentController.HEARTBEAT_INTERVAL` | `heartbeat` 事件发送频率 |
| SSE 总超时 | `300s` | `AgentController.STREAM_TIMEOUT_MS` | 单条流式请求最大持续时间 |

### 11.5 生产环境必改项

> 以下配置不建议直接使用默认值上线，部署前必须显式覆盖。

| 配置项 | 风险 | 生产建议 |
|------|------|------|
| `JWT_SECRET` | 弱密钥或空值导致令牌安全风险 | 使用高强度随机密钥（至少 32 字符） |
| `OPENAI_API_KEY` | 默认占位值无法鉴权或泄漏风险 | 使用真实密钥并通过密钥管理系统注入 |
| `OPENAI_BASE_URL` | 指向开发/内网地址导致不可用 | 切换为生产可用模型网关地址 |
| `WORKSPACE_ROOT` | 默认为 `.` 可能放大工具访问范围 | 明确限定到最小必要工作目录 |
| `PG_PASSWORD` / `REDIS_PASSWORD` | 弱口令或空口令导致数据风险 | 使用强口令并与环境分离管理 |
| `CORS_ALLOWED_ORIGINS` | 默认仅本地地址，不适合生产域名 | 设置为实际前端域名白名单 |

---

## 12. 部署与运行

### 12.1 Docker Compose 部署（推荐）

#### 步骤一：环境准备

```bash
cp env/dev.env.example env/dev.env
# 编辑 env/dev.env，填写：
# - JWT_SECRET (至少32字符)
# - OPENAI_API_KEY
# - POSTGRES_PASSWORD
```

#### 步骤二：构建并启动

```bash
# 使用部署脚本
./scripts/deploy.sh dev

# 或直接使用 docker-compose
docker-compose --env-file env/dev.env up -d --build
```

#### 步骤三：验证服务

```bash
# 冒烟测试
./scripts/smoke.sh dev
```

#### 服务端口

| 服务 | 默认端口 | 说明 |
|------|----------|------|
| Web UI | 8088 | Nginx 反向代理 |
| Backend API | 8080 | Spring Boot |
| PostgreSQL | 5432 | 数据库 |
| Redis | 6379 | 缓存 |

#### Docker Compose 服务依赖

```
postgres (healthcheck: pg_isready)
    ↓
redis (healthcheck: redis-cli ping)
    ↓
backend (healthcheck: /api/system/health/ready, depends_on: postgres + redis)
    ↓
web (depends_on: backend healthy)
```

### 12.2 本地开发运行

#### 后端

```bash
cd backend

# 需要本地 PostgreSQL 和 Redis
# 设置环境变量或使用 application.yml 默认值

mvn spring-boot:run
```

#### 前端

```bash
cd web
npm install
npm run dev    # 开发服务器 http://localhost:5173
npm run build  # 生产构建
```

#### CLI

```bash
cd cli

# 登录
mvn -q exec:java -Dexec.args="login --email <email> --password <password> --base-url http://localhost:8080"

# 创建会话
mvn -q exec:java -Dexec.args="create-session --provider OPENAI --model qwen/qwen3.5-9b"

# 同步对话
mvn -q exec:java -Dexec.args="chat --session-id <uuid> --message 'Hello'"

# 流式对话
mvn -q exec:java -Dexec.args="stream-chat --session-id <uuid> --message 'Hello'"

# 工具统计
mvn -q exec:java -Dexec.args="tool-stats --window-hours 24"

# 发布报告
mvn -q exec:java -Dexec.args="release-report --window-hours 24"
```

### 12.3 运维脚本

| 脚本 | 用途 |
|------|------|
| [deploy.sh](scripts/deploy.sh) | 部署指定环境 |
| [rollback.sh](scripts/rollback.sh) | 回滚到指定版本 |
| [smoke.sh](scripts/smoke.sh) | 冒烟测试（注册→登录→创建会话→流式对话→导出→报告） |
| [render-release-report.sh](scripts/render-release-report.sh) | 渲染发布报告 |

### 12.4 冒烟测试流程

[smoke.sh](scripts/smoke.sh) 执行以下步骤：

1. 检查 `/actuator/health` 和 `/api/system/health/ready`
2. 注册新用户
3. 登录获取 Access Token
4. 创建会话
5. 获取模型列表
6. 发起流式对话
7. 导出会话（JSON + Markdown）
8. 获取工具统计
9. 获取发布报告
10. 渲染报告（可选 PDF）
11. 所有产物保存到 `artifacts/smoke/` 目录

---

## 13. 开发指南

### 13.1 添加新的模型提供商

1. 在 `ModelProviderType` 枚举中添加新类型
2. 实现 `ModelProvider` 接口：
   - `type()` — 返回提供商类型
   - `chat(ModelChatRequest)` — 同步调用
   - `stream(ModelChatRequest, Consumer<String>)` — 流式调用
3. 在 `ModelGateway` 中注册新的 Provider Bean
4. 在 `application.yml` 中添加相关配置

### 13.2 添加新的工具

1. 在 `AgentToolOrchestrator.listToolSpecs()` 中注册工具规范
2. 在 `AgentToolOrchestrator.execute()` 的 switch 中添加执行分支
3. 在 `CodeToolService` 中实现工具逻辑
4. 确保路径操作通过 `resolveSafe()` 安全验证

### 13.3 数据库迁移

添加新迁移文件到 `backend/src/main/resources/db/migration/`，命名格式：`V{version}__{description}.sql`

示例：`V3__add_user_preferences.sql`

### 13.4 添加新的 REST 端点

1. 在对应模块的 Controller 中添加方法
2. 使用 `@Valid` 验证请求体
3. 通过 `requireUser(authentication)` 获取认证用户
4. 使用 MDC 记录请求上下文
5. 在 `SecurityConfig` 中配置权限（如需公开访问）

### 13.5 前端添加新功能

1. 在 `types.ts` 中定义 TypeScript 类型
2. 在 `api.ts` 中添加 API 方法
3. 在对应的 Zustand Store 中添加状态和方法
4. 创建或修改 UI 组件

### 13.6 项目构建

```bash
# 后端构建
cd backend && mvn clean package -DskipTests

# 前端构建
cd web && npm run build

# CLI 构建
cd cli && mvn clean package -DskipTests

# 全量构建（父 POM）
mvn clean package -DskipTests
```

### 13.7 测试

```bash
# 后端单元测试
cd backend && mvn test

# 后端集成测试（需要 Docker 运行 Testcontainers）
cd backend && mvn verify
```

**测试覆盖的模块**:
- `AgentControllerTest` — Agent 控制器测试
- `AgentFlowIntegrationTest` — Agent 流程集成测试
- `AgentServiceTest` — Agent 服务单元测试
- `ModelRoutingServiceTest` — 模型路由测试
- `JwtServiceTest` — JWT 服务测试
- `PasswordEncoderTest` — 密码编码器测试
- `ApiExceptionHandlerTest` — 异常处理器测试
- `StartupValidationRunnerTest` — 启动校验测试
- `RedisRateLimiterServiceTest` — 限流服务测试
- `ReleaseReportServiceTest` — 发布报告测试
- `ToolAuditServiceTest` — 工具审计测试

---

## 14. 术语表

| 术语 | 定义 |
|------|------|
| ReAct | 模型先推理再行动的循环模式，在本项目中体现为“模型回复 + 工具执行 + 再推理”。 |
| SSE | Server-Sent Events，后端持续推送事件流给客户端的协议。 |
| ToolCall | 模型发起的一次工具调用请求，包含工具名与参数。 |
| ToolTrace | 单轮或多轮工具执行过程与结果的追踪信息。 |
| ToolAudit | 持久化的工具调用审计记录，用于统计、追溯和报表。 |
| Premium 用户 | 命中 `premium-email-suffixes` 配置的用户，享有更高聊天限流额度。 |
| Refresh Token 轮转 | 每次刷新令牌后更新版本，旧刷新令牌失效的安全机制。 |
| Workspace Root | 工具可访问的根目录边界，`resolveSafe()` 依赖它防止路径逃逸。 |

## 15. 变更记录

| 日期 | 改动摘要 | 影响章节 |
|------|----------|----------|
| 2026-05-14 | 新增 Desktop 桌面客户端模块章节（第 6 章），更新整体架构图加入 Desktop 客户端，补充 Desktop NPM 依赖（10.4），全量重编号章节；基于源码实际实现校验所有常量、方法签名和配置项。 | 目录、2、6、10、所有章节编号 |
| 2026-05-01 | 全量优化文档结构与可维护性：新增元信息、系统限制、生产必改项、术语表、失败示例和快速上手路径；统一相对路径链接并修复文本质量问题。 | 目录、2、3、4、5、8、10、13、14 |

*文档生成时间: 2026-05-14*
