# Knowledge Desk · Python backend (FastAPI)

本机单用户的 Knowledge Desk 后端 MVP，用 FastAPI 替代原 Spring Boot 后端，
**保持既有 `/api/v1` 契约**，让现有 Electron + React 桌面端不需要改动业务代码
即可切换后端运行时。

- 现有 `backend/`（Java）、`python-service/`（独立解析服务）与未提交改动全部保留，
  作为可回退基线；本目录是**新增**的独立后端，不覆盖、不改造既有实现。
- 数据源是**新建的本地 SQLite**：`<dataDir>/knowledge-desk.sqlite3`，受管原件位于
  `<dataDir>/sources/`。不导入旧 H2 数据。
- 产品闭环：**采集 → Inbox → 可选 AI 整理 → Library/搜索 → Detail → Review → 本地备份恢复**。

## 目录结构

```
python-backend/
├── pyproject.toml            # uv 管理依赖与锁文件（Python 3.12 基线）
├── alembic.ini               # CLI 迁移入口（运行时不依赖它，见下）
├── env.example               # 环境变量说明
├── scripts/smoke-local.sh    # 本机 HTTP 冒烟：完整闭环 PASS/FAIL
└── src/knowledge_desk/
    ├── config.py             # 环境驱动配置（dataDir / port / 密钥 / 上传上限）
    ├── errors.py             # 统一错误taxonomy → {"message","code"}
    ├── main.py               # 应用工厂 + 错误处理 + 进程入口
    ├── api/                  # api 层：schemas / deps / serializers / routers
    ├── application/          # application 层：auth / knowledge / ingest / organize / model_source / settings / review
    ├── domain/               # domain 层：enums / SQLAlchemy 模型 / 复习间隔算法
    ├── infrastructure/       # infrastructure 层：database / security / crypto / llm / document_parser / redaction
    └── migrations/           # Alembic 0001 初始迁移
```

分层约束（与计划一致）：路由层不直接访问数据库或调用模型，只做契约转换与依赖注入。

## 快速开始

```bash
cd python-backend
uv sync --extra dev                       # Python 3.12 + 依赖

# 本机运行（默认 127.0.0.1:18080，数据目录 ~/Library/Application Support/KnowledgeDesk）
KD_DATA_DIR=/tmp/kd-dev \
KD_JWT_SECRET="dev-jwt-secret-at-least-32-characters" \
KD_DB_ENCRYPTION_KEY="dev-encryption-key" \
uv run python -m knowledge_desk.main

curl --noproxy '*' http://127.0.0.1:18080/api/v1/system/health/ready
```

环境变量（兼容 Electron 现有 `BackendManager` 命名）：

| 变量 | 别名 | 说明 |
| --- | --- | --- |
| `KD_DATA_DIR` | `APP_DATA_DIR` | 数据库、受管原件与日志根目录 |
| `KD_PORT` / `KD_HOST` | `PORT` / `HOST` | 仅监听回环地址，默认 `127.0.0.1:18080` |
| `KD_DESKTOP_MODE` | `APP_DESKTOP_MODE` | 桌面运行时模式（关闭 `/docs`） |
| `KD_JWT_SECRET` | `JWT_SECRET` | HS256 签名密钥；缺省时在 dataDir 内生成并 0600 持久化 |
| `KD_DB_ENCRYPTION_KEY` | `SECURITY_DB_ENCRYPTION_KEY` | 模型凭据加密密钥；缺省则拒绝持久化凭据（503） |
| `KD_ORGANIZE_NO_MODEL` | — | `heuristic`（默认，沿用已发布的本地启发式）或 `fail` |
| `KD_MAX_UPLOAD_BYTES` | — | 上传上限，默认 50MB |
| `KD_LLM_TIMEOUT_SECONDS` | — | 模型调用超时，默认 30s |

## 契约对齐

路径、方法、请求/响应字段（camelCase）、状态码与错误结构均对齐桌面端 `knowledgeDeskApi.ts`
依赖的现有契约，并用 `tests/test_contract.py` 做路由清单与字段命名的回归门禁：

- 系统：`GET /api/v1/system/health/ready`（**无需认证**，供 `BackendManager` 轮询）
- 认证：`register` / `login` / `refresh` / `logout` / `me`
- 知识条目：分页列表（`status` 可重复）、`search`、详情、更新、`import/{web,snippet,file,upload,preflight}`、
  `organize-batch`、`{id}/{organize,reprocess,archive,restore}`
- 标签、导入任务、模型源（含 `enable` / `disable` / `set-default` / `test`）
- 设置：`profile`（GET/PUT）、`storage`、`export`、`import`
- 复习：`queue`、`summary`、`{itemId}/complete`

两处与 Electron 主进程的**隐式耦合**已在代码中固化并加测试：

1. 登录失败必须返回 `Invalid email or password`，主进程据此触发首次运行自动注册；
2. 邮箱重复必须包含 `already`，主进程据此判定为可忽略的注册冲突。
3. 知识条目 id 必须是 36 位 UUID：主进程用 UUID 正则白名单校验复习提交路径。

错误统一为 `{"message": ..., "code": ...}`（校验失败额外带 `details`），参数非法返回 400。

## 数据与迁移

- 模型：用户、用户偏好、知识条目、标签及关联、模型源、导入任务、复习状态、受管原件元数据。
- 时间统一以 UTC 存储、以 ISO-8601 返回；`archived_at` / `due_at` 等可空。
- `run_migrations()` 在进程启动时执行 `alembic upgrade head`，**可重复执行**（已在 head 时为 no-op），
  打包后的桌面运行时不依赖额外的迁移步骤。
- `tests/test_migrations.py` 用 `compare_metadata` 断言「迁移后的 schema == ORM 元数据」，防止模型与迁移漂移；
  同时覆盖 downgrade → upgrade 全周期。

## 安全

- 口令：`hashlib.scrypt`（每口令独立盐）。
- 会话：HS256 JWT（`access` / `refresh` 区分 `typ`，`jti`，30s leeway）。
- 模型凭据：Fernet（密钥材料经 SHA-256 派生）加密后入库，只落 `enc:v1:` 密文；
  API 只返回写入时计算的掩码（如 `sk-…1234`），响应体与日志中都不存在明文。
- 日志、任务错误、导出与异常响应统一经过脱敏（`sk-*`、Bearer、JWT、`/Users/<name>` 等）。
- 受管原件只记录**相对于 sources 目录**的路径；绝对本机路径既不落库也不出接口。

## 可选 AI 整理与降级

- 模型源支持 OpenAI 兼容配置、连通性测试、启停与默认源切换；`summary` / `tagging` / `default` 分别解析。
- `organizeMode=auto` 时导入后异步整理（条目先置 `processing`，后台任务用自己的会话，模型再慢也不阻塞导入）。
- 未配置模型：默认走确定性本地启发式（摘要 + 标签 + 清理），任务记为 `succeeded` 并带 `local_heuristic` 说明——
  这是 v0.1.0-beta.3 已发布能力；若需要严格按 MVP 合同「未配置模型即失败」，设 `KD_ORGANIZE_NO_MODEL=fail`。
- 模型连接失败/超时/返回空：任务记为 `failed` 并返回明确但不泄密的说明，条目仍可编辑、搜索、归档、备份与重试。

## 文档解析

| 格式 | 解析路径 |
| --- | --- |
| PDF | `pdfplumber`（页码与 PDF 元数据） |
| DOCX | `python-docx`（段落 + 表格 + 核心属性） |
| PPTX | `python-pptx`（逐页文本 + 页数） |
| Markdown / TXT / HTML | 内置解析（标题、标题计数、行数；HTML 去脚本样式并抽取 `<title>`） |

MarkItDown 作为**可选**回退（`uv sync --extra markitdown`），仅在原生解析器失败时尝试；
默认不安装以降低桌面打包体积与风险。

## 测试与验证

```bash
uv run pytest                      # 172 passed
uv run pytest --cov=knowledge_desk # 覆盖率 ~91%
./scripts/smoke-local.sh           # 起真实进程，跑完整闭环
```

- 单元/接口：迁移与漂移、分页/筛选/搜索、归档恢复、任务流转、复习间隔算法、备份合并恢复。
- 错误路径：认证失败、404、跨用户越权、参数非法、重复导入（409）、模型源冲突（409）、
  超时降级（502）、凭据缺失（503）、不支持类型（415）、超限（413）。
- 模型部分用 mock 验证连通性测试、整理成功、失败降级，并断言 API Key 不出现在响应/日志。
- `scripts/smoke-local.sh`：真实 `uvicorn` 进程 + `curl --noproxy '*'` 探活，
  再走「注册登录 → 导入 → 列表 → 整理 → 搜索 → 任务流水 → 复习队列/提交 → 归档/恢复 → 导出/导入」
  全部 PASS。

## 不在本 MVP 范围

Agent 流式聊天、会话、Dev Coach、Sentinel、CLI、Computer Use、Kubernetes、Kafka/Milvus、
发布报表接口均不迁移，继续保留在 Java/扩展范围内，后续按独立阶段评估。
多用户服务端部署、跨设备同步、旧 H2 数据迁移同样不在范围内。

## 后续阶段（未完成）

1. Electron 侧 `BackendManager` 抽象为受管本地进程启动器，并支持 Java / Python 基线显式切换。
2. PyInstaller 构建 macOS arm64 / x64 后端运行时，作为 `extraResources` 打入安装包。
3. 安装包验收：`.app` 启动后 `curl --noproxy '*'` 验证 readiness，再人工回归核心页面交互。
