# Java AI Agent MVP - Code Wiki 文档

## 目录

1. [项目概述](#项目概述)
2. [系统架构](#系统架构)
3. [核心模块](#核心模块)
4. [关键类与函数](#关键类与函数)
5. [数据模型](#数据模型)
6. [API 接口](#api-接口)
7. [依赖关系](#依赖关系)
8. [部署与运行](#部署与运行)

---

## 项目概述

### 项目简介

Java AI Agent MVP 是一个完整的 AI 智能助手应用，提供了后端服务、Web 前端和命令行工具。该系统支持流式对话、会话管理、多模型提供商、工具调用审计等功能。

### 技术栈

| 层级 | 技术选型 |
|------|----------|
| 后端框架 | Spring Boot 3.3.2 |
| 编程语言 | Java 21 |
| 数据库 | PostgreSQL 16 |
| 缓存 | Redis 7 |
| 前端 | React 18 + TypeScript + Vite |
| 构建工具 | Maven |
| 容器化 | Docker + Docker Compose |
| 认证 | JWT |
| 迁移 | Flyway |

### 项目结构

```
AI-agent/
├── backend/                 # Spring Boot 后端服务
├── web/                     # React 前端应用
├── cli/                     # Java 命令行工具
├── env/                     # 环境配置模板
├── scripts/                 # 部署和测试脚本
├── uml/                     # UML 图表
└── artifacts/               # 测试产物
```

---

## 系统架构

### 整体架构图

系统采用典型的分层架构设计，包括：

```
┌─────────────────────────────────────────────────────────────┐
│                        客户端层                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Web UI    │  │    CLI      │  │  第三方集成  │         │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘         │
└─────────┼────────────────┼───────────────────────────────────┘
          │                │
          └────────┬───────┘
                   │
┌──────────────────┼───────────────────────────────────────────┐
│   ┌──────────────▼──────────────┐     Nginx (Web/API Proxy)  │
│   │         Controller 层        │                            │
│   └──────────────┬──────────────┘                            │
│   ┌──────────────▼──────────────┐                            │
│   │         Service 层           │   Spring Boot Backend      │
│   └──────────────┬──────────────┘                            │
│   ┌──────────────▼──────────────┐                            │
│   │     Repository / Provider   │                            │
│   └──────┬──────────────┬───────┘                            │
└──────────┼──────────────┼─────────────────────────────────────┘
           │              │
    ┌──────▼──────┐ ┌─────▼──────┐
    │  PostgreSQL │ │   Redis    │
    └─────────────┘ └────────────┘
```

### 分层职责

| 层级 | 职责 |
|------|------|
| Controller | 处理 HTTP 请求，参数验证，响应封装 |
| Service | 业务逻辑实现，事务控制 |
| Repository | 数据库访问（JPA） |
| Provider | 外部模型服务集成 |
| Infra | 基础设施（Redis 缓存、限流等） |

---

## 核心模块

### 1. 认证与授权模块 (auth)

**包路径**: `com.agent.mvp.auth`

**核心功能**:
- 用户注册与登录
- JWT 令牌颁发与刷新
- 密码强度验证
- Refresh Token 轮转机制

**核心类**:
- [AuthService](#authservice) - 认证业务逻辑
- [JwtService](#jjwtservice) - JWT 处理
- [UserRepository](#userrepository) - 用户数据访问
- [SecurityConfig](#securityconfig) - Spring Security 配置

### 2. Agent 核心模块 (agent)

**包路径**: `com.agent.mvp.agent`

**核心功能**:
- 同步对话处理
- SSE 流式对话
- 模型路由与配置
- 工具调用编排
- 上下文管理

**核心类**:
- [AgentService](#agentservice) - Agent 业务逻辑
- [ModelGateway](#modelgateway) - 模型网关
- [ModelRoutingService](#modelroutingservice) - 模型路由
- [AgentToolOrchestrator](#agenttoolorchestrator) - 工具编排

### 3. 会话管理模块 (session)

**包路径**: `com.agent.mvp.session`

**核心功能**:
- 会话创建与查询
- 消息持久化
- 会话导出（JSON/Markdown）
- Redis 缓存优化

**核心类**:
- [SessionService](#sessionservice) - 会话业务逻辑
- [ConversationSessionRepository](#conversationsessionrepository)
- [MessageRepository](#messagerepository)

### 4. 系统管理模块 (system)

**包路径**: `com.agent.mvp.system`

**核心功能**:
- 健康检查
- 模型列表获取
- 工具统计分析
- 发布报告生成

### 5. 基础设施模块 (infra)

**包路径**: `com.agent.mvp.infra`

**核心功能**:
- Redis 限流服务
- 会话缓存服务

### 6. 公共模块 (common)

**包路径**: `com.agent.mvp.common`

**核心功能**:
- 全局异常处理
- 统一响应格式
- 请求上下文传递

---

## 关键类与函数

### 1. AgentService

**文件**: [AgentService.java](file:///Users/liuyongze/Documents/AI-agent/backend/src/main/java/com/agent/mvp/agent/service/AgentService.java)

**职责**: Agent 对话的核心业务逻辑

**核心方法**:

| 方法 | 描述 |
|------|------|
| `chat(userId, request)` | 同步对话处理 |
| `streamChat(userId, request, metaConsumer, chunkConsumer)` | 流式对话处理 |
| `executeLoop(userId, session, resolved, chunkConsumer)` | Agent 循环执行（最多4步工具调用） |

**关键常量**:
- `MAX_CONTEXT_TOKENS = 6_000` - 最大上下文 Token 数
- `MAX_TOOL_STEPS = 4` - 最大工具调用步数

### 2. AuthService

**文件**: [AuthService.java](file:///Users/liuyongze/Documents/AI-agent/backend/src/main/java/com/agent/mvp/auth/service/AuthService.java)

**职责**: 用户认证与授权业务逻辑

**核心方法**:

| 方法 | 描述 |
|------|------|
| `register(email, password)` | 用户注册 |
| `login(request)` | 用户登录 |
| `refresh(refreshToken)` | 刷新访问令牌 |
| `me(authenticatedUser)` | 获取当前用户信息 |

**密码强度要求**:
- 最小长度 8 位
- 包含大小写字母
- 包含数字
- 包含特殊字符

### 3. SessionService

**文件**: [SessionService.java](file:///Users/liuyongze/Documents/AI-agent/backend/src/main/java/com/agent/mvp/session/service/SessionService.java)

**职责**: 会话与消息管理

**核心方法**:

| 方法 | 描述 |
|------|------|
| `createSession(userId, request)` | 创建新会话 |
| `listSessions(userId)` | 列出用户会话 |
| `listMessages(userId, sessionId)` | 获取会话消息（含Redis缓存） |
| `exportSession(userId, sessionId)` | 导出会话（JSON） |
| `exportSessionMarkdown(userId, sessionId)` | 导出会话（Markdown） |
| `saveMessage(session, role, content, ...)` | 保存消息 |

### 4. ModelGateway

**职责**: 封装与模型提供商的交互

**核心方法**:
- `chat(provider, request)` - 同步模型调用
- `stream(provider, request, chunkConsumer)` - 流式模型调用

### 5. JwtService

**职责**: JWT 令牌的生成、验证与解析

**核心功能**:
- 生成访问令牌（Access Token）和刷新令牌（Refresh Token）
- 令牌验证与用户ID提取
- 令牌版本管理（支持刷新令牌轮转）

---

## 数据模型

### 数据库表结构

**迁移文件**: [V1__init_schema.sql](file:///Users/liuyongze/Documents/AI-agent/backend/src/main/resources/db/migration/V1__init_schema.sql)

#### 1. users 表

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | UUID | PK | 用户ID |
| email | VARCHAR(255) | UNIQUE NOT NULL | 用户邮箱 |
| password_hash | VARCHAR(255) | NOT NULL | 密码哈希 |
| created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| token_version | INT | DEFAULT 0 | 令牌版本 |

#### 2. conversation_sessions 表

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | UUID | PK | 会话ID |
| user_id | UUID | FK NOT NULL | 用户ID |
| title | VARCHAR(120) | NOT NULL | 会话标题 |
| provider | VARCHAR(32) | NOT NULL | 模型提供商 |
| model | VARCHAR(128) | NOT NULL | 模型名称 |
| created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |

**索引**: `idx_sessions_user_updated` (user_id, updated_at DESC)

#### 3. messages 表

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | UUID | PK | 消息ID |
| session_id | UUID | FK NOT NULL | 会话ID |
| role | VARCHAR(32) | NOT NULL | 消息角色（user/assistant/tool） |
| content | TEXT | NOT NULL | 消息内容 |
| tool_trace | TEXT | NULL | 工具调用追踪 |
| provider | VARCHAR(32) | NOT NULL | 模型提供商 |
| model | VARCHAR(128) | NOT NULL | 模型名称 |
| created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |

**索引**: `idx_messages_session_created` (session_id, created_at)

#### 4. tool_audits 表

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| id | UUID | PK | 审计记录ID |
| user_id | UUID | NOT NULL | 用户ID |
| session_id | UUID | NOT NULL | 会话ID |
| tool_name | VARCHAR(120) | NOT NULL | 工具名称 |
| args_json | TEXT | NULL | 工具参数JSON |
| status | VARCHAR(32) | NOT NULL | 执行状态 |
| duration_ms | BIGINT | NOT NULL | 执行耗时 |
| provider | VARCHAR(32) | NOT NULL | 模型提供商 |
| model | VARCHAR(128) | NOT NULL | 模型名称 |
| created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |

**索引**: `idx_tool_audits_session_created` (session_id, created_at)

### 实体类

| 实体类 | 对应表 |
|--------|--------|
| User | users |
| ConversationSession | conversation_sessions |
| Message | messages |
| ToolAudit | tool_audits |

---

## API 接口

### 认证接口 (Auth)

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 用户注册 | 否 |
| POST | `/api/auth/login` | 用户登录 | 否 |
| POST | `/api/auth/refresh` | 刷新令牌 | Refresh Token |
| GET | `/api/auth/me` | 获取当前用户 | Access Token |

### 会话接口 (Sessions)

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/sessions` | 创建会话 | Access Token |
| GET | `/api/sessions` | 列出会话 | Access Token |
| GET | `/api/sessions/{id}/messages` | 获取消息 | Access Token |
| GET | `/api/sessions/{id}/export` | 导出会话 | Access Token |

### Agent 接口 (Agent)

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/agent/chat` | 同步对话 | Access Token |
| POST | `/api/agent/chat/stream` | 流式对话 (SSE) | Access Token |

### 系统接口 (System)

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/system/models` | 获取模型列表 | Access Token |
| GET | `/api/system/health/ready` | 健康检查 | 否 |
| GET | `/api/system/tool-stats` | 工具统计 | Access Token |
| GET | `/api/system/release-report` | 发布报告 | Access Token |

### SSE 流式事件

`/api/agent/chat/stream` 返回的事件类型:

| 事件 | 描述 |
|------|------|
| `message` | 内容片段 |
| `heartbeat` | 心跳保活 |
| `error` | 错误信息 |
| `done` | 完成信号 |

---

## 依赖关系

### 后端依赖

**文件**: [pom.xml](file:///Users/liuyongze/Documents/AI-agent/backend/pom.xml)

| 依赖 | 版本 | 用途 |
|------|------|------|
| spring-boot-starter-web | 3.3.2 | Web MVC |
| spring-boot-starter-webflux | 3.3.2 | 响应式 Web (SSE) |
| spring-boot-starter-security | 3.3.2 | 安全认证 |
| spring-boot-starter-data-jpa | 3.3.2 | JPA ORM |
| spring-boot-starter-data-redis | 3.3.2 | Redis 集成 |
| spring-boot-starter-actuator | 3.3.2 | 监控端点 |
| spring-boot-starter-validation | 3.3.2 | 参数验证 |
| jjwt | 0.12.6 | JWT 处理 |
| flyway-core / flyway-database-postgresql | 10.22.0 | 数据库迁移 |
| postgresql | - | PostgreSQL 驱动 |

### 前端依赖

**文件**: [package.json](file:///Users/liuyongze/Documents/AI-agent/web/package.json)

| 依赖 | 版本 | 用途 |
|------|------|------|
| react | 18.3.1 | UI 框架 |
| react-dom | 18.3.1 | DOM 渲染 |
| react-markdown | 10.1.0 | Markdown 渲染 |
| remark-gfm | 4.0.1 | GFM 支持 |
| react-virtuoso | 4.18.6 | 虚拟滚动 |
| zustand | 5.0.12 | 状态管理 |
| lucide-react | 1.8.0 | 图标库 |
| vite | 5.4.2 | 构建工具 |

### 服务依赖关系

```
┌─────────────────────────────────────────┐
│         Web / CLI Client                │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│         Backend (Spring Boot)           │
│  ┌─────────────────────────────────┐   │
│  │  Controller Layer               │   │
│  └──────────┬──────────────────────┘   │
│  ┌──────────▼──────────────────────┐   │
│  │  Service Layer                  │   │
│  │  ┌─────────────┐  ┌─────────┐  │   │
│  │  │AgentService │  │AuthSvc  │  │   │
│  │  │SessionSvc   │  │ToolAudit│  │   │
│  │  └──────┬──────┘  └────┬────┘  │   │
│  └─────────┼──────────────┼─────────┘   │
│  ┌─────────▼──────────────▼─────────┐   │
│  │  Repository / Provider Layer     │   │
│  └────┬─────────────────────┬──────┘   │
└───────┼─────────────────────┼──────────┘
        │                     │
        ▼                     ▼
┌───────────────┐    ┌───────────────┐
│   PostgreSQL  │    │    Redis      │
└───────────────┘    └───────────────┘
```

---

## 部署与运行

### Docker Compose 部署

**文件**: [docker-compose.yml](file:///Users/liuyongze/Documents/AI-agent/docker-compose.yml)

#### 1. 环境准备

```bash
# 复制环境变量模板
cp env/dev.env.example env/dev.env

# 编辑配置文件，填写必要的密钥
# - JWT_SECRET
# - OPENAI_API_KEY
# - 数据库密码等
```

#### 2. 启动服务

```bash
# 一键部署
./scripts/deploy.sh dev

# 或直接使用 docker-compose
docker-compose --env-file env/dev.env up -d --build
```

#### 3. 服务访问

| 服务 | 默认地址 |
|------|----------|
| Web UI | http://localhost:8088 |
| Backend API | http://localhost:8080 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

#### 4. 冒烟测试

```bash
./scripts/smoke.sh dev
```

测试内容：
- 健康检查
- 注册/登录流程
- 创建会话
- 流式对话
- 生成发布报告

#### 5. 回滚

```bash
# 回滚到上一版本
./scripts/rollback.sh dev

# 回滚到指定版本
./scripts/rollback.sh dev <tag>
```

### 本地开发运行

#### 后端

```bash
cd backend
mvn spring-boot:run
```

#### 前端

```bash
cd web
npm install
npm run dev
```

#### CLI

```bash
cd cli

# 登录
mvn -q exec:java -Dexec.args="login --email <email> --password <password> --base-url http://localhost:8080"

# 创建会话
mvn -q exec:java -Dexec.args="create-session --provider OPENAI --model qwen/qwen3.5-9b"

# 同步对话
mvn -q exec:java -Dexec.args="chat --message 'Hello'"

# 流式对话
mvn -q exec:java -Dexec.args="stream-chat --message 'Hello'"

# 工具统计
mvn -q exec:java -Dexec.args="tool-stats --window-hours 24"

# 发布报告
mvn -q exec:java -Dexec.args="release-report --window-hours 24"
```

### 配置参数

**主要配置项** (可在环境变量中设置):

| 参数 | 默认值 | 描述 |
|------|--------|------|
| `JWT_SECRET` | - | JWT 签名密钥 |
| `OPENAI_API_KEY` | - | OpenAI API 密钥 |
| `OPENAI_BASE_URL` | http://10.115.10.220:1234/v1 | 模型 API 地址 |
| `OPENAI_MODEL` | qwen/qwen3.5-9b | 默认模型 |
| `MODEL_CONNECT_TIMEOUT_MS` | 5000 | 模型连接超时 |
| `MODEL_READ_TIMEOUT_MS` | 45000 | 模型读取超时 |
| `CHAT_RATE_LIMIT_PER_MIN` | 60 | 聊天限流 |
| `CORS_ALLOWED_ORIGINS` | http://localhost:8088 | CORS 允许源 |

---

## 开发指南

### 添加新的模型提供商

1. 实现 `ModelProvider` 接口
2. 在 `ModelProviderType` 枚举中添加新类型
3. 在 `ModelRoutingService` 中配置路由规则

### 添加新的工具

1. 在 `AgentToolOrchestrator` 中定义工具规格
2. 实现工具执行逻辑
3. 在 `ToolSpec` 中配置参数定义

### 数据库迁移

添加新迁移文件到 `backend/src/main/resources/db/migration/`，命名格式: `V{version}__{description}.sql`

---

## 附录

### 相关文档

- [README.md](file:///Users/liuyongze/Documents/AI-agent/README.md) - 项目说明
- [实验二_需求规格说明书_面向对象方法学.md](file:///Users/liuyongze/Documents/AI-agent/实验二_需求规格说明书_面向对象方法学.md) - 需求规格说明书
- UML 图表见 [uml/](file:///Users/liuyongze/Documents/AI-agent/uml/) 目录

### 联系方式

如有问题，请查阅项目 README 或联系维护者。

---

*文档生成时间: 2026-05-01*
