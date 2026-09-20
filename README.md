# AI Agent Knowledge Desk

AI Agent Knowledge Desk is a local-first desktop knowledge application and a full-stack AI portfolio project. Its primary deliverable is the Electron desktop app backed by Spring Boot; the repository also contains a TypeScript CLI and an optional deployable server stack.

## 产品主线与模块边界

- 主产品：**AI Agent Knowledge Desk** —— local-first 个人知识工作台，支持 macOS 与 Windows 的 Electron 桌面应用，随包内置 Spring Boot 后端、H2 数据库与对应平台 JRE；核心闭环是「收集 → Inbox 整理 → AI 元数据增强 → Library 浏览/搜索 → Detail 回看」。
- 默认交付面只有 Knowledge Desk 桌面闭环：渲染层唯一入口 `desktop/src/renderer-vue/src/App.vue` → `desktop/src/renderer-vue/src/knowledge-desk/KnowledgeDeskApp.vue`。
- 以下均为**可选模块**，不属于主产品默认交付范围：`ts-cli`、Java Dev Coach、`python-service`、`docker-compose`/`k8s` 服务端栈、Codex 对齐的编码 Agent 能力（Thread/Worktree/PTY/Skills/Computer Use）、`local-service`、legacy `agent-*` 微服务。
- 各可选模块的状态、是否随桌面包发布、入口文件与风险，以及「文档冲突处置规则」，见 [产品主线与模块边界](docs/arch/000-product-line.md)。
- README 与 `docs/arch/*` 口径冲突时，以 `docs/arch/000-product-line.md` 为准。

## Personal desktop Beta scope

- The macOS and Windows installers bundle the backend JAR and a platform-native Java runtime, and start a local H2 database automatically. Normal desktop use does not require a separate Java, PostgreSQL, or Docker installation.
- Knowledge capture, import, search, tagging, review, backup, and restore work without a model provider.
- AI 知识整理只使用用户主动配置并通过连接测试的云端 DeepSeek、OpenAI 或其他公网 OpenAI-compatible 端点；桌面运行模式未配置可用云端模型时，整理会明确失败，不会用规则标签伪装成模型结果。基础知识管理仍可使用，但不宣称 AI 整理已完成。
- API Key 使用加密的模型来源持久化；演示、日志和备份均不得暴露真实密钥。当前桌面设置页聚焦知识整理，不把尚未完成的检索问答或完整多云路由包装为已交付能力。

Repository components:

- `backend`: Spring Boot API for authentication, knowledge workflows, model sources, sessions, and SSE chat
- `desktop`: Electron + Vue 3 + TypeScript desktop client with a bundled standalone runtime
- `python-service`: local document parsing service
- `ts-cli`: TypeScript + React (Ink) terminal client
- `docker-compose`: optional single-host server stack with PostgreSQL, Redis, Kafka, Milvus, parsing, and monitoring

Portfolio and interview materials:

- [Product architecture and core flows](PROJECT_SHOWCASE.md)
- [Resume bullets and interview playbook](RESUME_PROJECT_GUIDE.md)
- [Demo script and verification evidence](docs/portfolio/README.md)

## AI + Java Dev Coach（supporting Beta module）

The backend also includes a first-pass "AI + Java development cockpit" for students becoming Java + AI developers:

- Requirement breakdown: turns a raw feature idea into goal, modules, data structures, APIs, risks, and test points.
- Java AI scaffold generator: creates deterministic Spring Boot starter ZIPs with previewable file trees.
- Log diagnosis: turns logs into symptom, root cause, trigger condition, minimal fix, and verification steps.
- Coach history: stores recent coach runs so solved problems become searchable engineering memory.

Scaffold presets:

- `spring-ai-rag-starter`
- `langchain4j-agent-starter`
- `spring-boot-agent-basic`

Generated ZIP artifacts are stored under `var/coach-artifacts/` and are ignored by git.

## Beta One-Command Delivery

### 1) Prepare environment
```bash
cp env/dev.env.example env/dev.env
```

Edit `env/dev.env` and fill secrets (`JWT_SECRET`, `OPENAI_API_KEY`, database password, etc.).

### 2) Deploy
Run the local release gate before starting a deployment:

```bash
./scripts/release-check.sh dev
```

For the server deployment gate, create `env/prod.env` with real secrets first. Production deploy/rollback refuses to use `env/prod.env.example`. This command is not a substitute for the signed macOS installer gate below.

```bash
./scripts/release-check.sh prod
```

Then deploy:

```bash
./scripts/deploy.sh dev
```
`deploy.sh` runs `scripts/check-consistency.sh` before building so API path drift is caught early. When `SMOKE_USE_OPENAI_MOCK=true`, it also overrides backend OpenAI endpoint to the local mock URL.

CI runs the same `scripts/release-check.sh dev` gate, so pull requests and local release checks fail on the same class of production/full dependency audit, build, desktop, Compose, and config regressions.
Additionally, the GitHub Actions CI pipeline enforces the following code quality and safety gates:
- **JaCoCo Coverage**: `backend` Maven `verify` enforces bundle-level line coverage ≥65% and branch coverage ≥60%. These source-quality gates are separate from any published installer release claim.
- **Spotless Formatting**: Fails the build if Java code is not formatted according to the project style guidelines.
- **Main Process Tests**: Runs the Electron main process tests.
- **Full Safety Audit**: Prevents legacy/development tool exposures in production builds.

To include Electron directory packaging in the local gate:

```bash
RELEASE_CHECK_PACKAGE_DESKTOP=true ./scripts/release-check.sh dev
```

Desktop packaging requires Node.js 22 (`.nvmrc` pins the release line). The packaged app is checked for `app.asar`, embedded `backend-jre`, `ts-cli`, `local-service`, and accidental build-time dependencies.

To generate an unsigned macOS packaging diagnostic (`.dmg` and `.zip`):

```bash
RELEASE_CHECK_DESKTOP_DISTRIBUTABLE=true ./scripts/release-check.sh dev
```

This also writes release evidence under `desktop/release/`:
- `release-manifest.json`: version, git commit, artifact sizes/checksums, and macOS app trust status
- `SHA256SUMS`: publishable SHA-256 checksums for generated installers

该诊断产物不能作为正式签名候选发布。个人 Beta 的 ad-hoc 发布必须走单独的 Beta checklist，并如实声明未公证边界；Developer ID 签名和公证的正式 macOS 发行仍要求精确版本 tag、干净源码、GitHub Packages access 与以下环境变量。使用规范门禁（或委托给它的 `desktop/scripts/build-all.sh --release`）：

```bash
GITHUB_ACTOR=<github-user> GITHUB_TOKEN=<packages-read-token> \
CSC_LINK=<base64-p12-or-path> CSC_KEY_PASSWORD=<certificate-password> \
APPLE_ID=<apple-id> APPLE_APP_SPECIFIC_PASSWORD=<app-password> \
APPLE_TEAM_ID=<team-id> \
./scripts/release-check-macos.sh
```

### Desktop Beta candidate workflow

推送与 `desktop/package.json` 版本一致、且可从 `origin/main` 到达的 `v*` tag 后，`Desktop Release Candidate` 工作流会在两个原生 runner 上并行构建：macOS arm64 生成 DMG/ZIP，Windows x64 生成 NSIS EXE。两个平台的产物汇总后统一生成 `release-manifest.json` 与 `SHA256SUMS`，先创建 draft，重新下载并复算哈希，全部通过后才发布 prerelease。

当前候选版本为 `0.1.0-beta.5`，所有发布组件已统一版本，macOS `bundleVersion` 同步为 `5`。历史 `v0.1.0-beta.4` tag 与资产保持不可变；新的双平台安装包使用新 tag 发布，不覆盖旧版。

个人 `-beta.` 的 macOS 包未使用 Developer ID 签名与 Apple 公证；Windows 安装包当前也未做代码签名，首次运行可能出现 Gatekeeper 或 Microsoft Defender SmartScreen 提示。非 beta tag 仍进入 GitHub `release` Environment，并强制执行 Developer ID 签名、公证、Gatekeeper、stapler 与干净源码门禁；Windows 签名是后续独立凭据项，不以普通打包替代。

The packaged beta deliberately excludes legacy developer tooling, including Computer Use, even if `AI_AGENT_ENABLE_LEGACY_DEVTOOLS=1` is supplied at runtime. That capability remains source-checkout-only until its approval, window allowlist, and screenshot privacy controls are production-ready.

See [the macOS beta release checklist](docs/release/macos-beta.md) for local Beta packaging, formal signed-release requirements, tag provenance, review, and rollback steps. Windows x64 产物由同一 tag 的 Windows runner 原生构建，不使用 macOS 交叉打包。

To regenerate evidence for existing artifacts without rebuilding:

```bash
./scripts/release-manifest.sh
```

To run a **local dev diagnostic** against existing distributables without rebuilding DMG/ZIP:

```bash
RELEASE_CHECK_DESKTOP_DISTRIBUTABLE=true \
RELEASE_CHECK_REUSE_DESKTOP_DISTRIBUTABLE=true \
./scripts/release-check.sh dev
```

This reuse mode is deliberately rejected for tag, signing, Gatekeeper, and the canonical macOS release gate so a stale installer can never be treated as a release candidate.

### 3) Smoke test
```bash
./scripts/smoke.sh dev
```
`smoke.sh` also runs `scripts/check-consistency.sh` first.

Smoke defaults to deterministic local execution when `MODEL_PROVIDER=OPENAI`:
- `SMOKE_USE_OPENAI_MOCK=true` (default) auto-starts the bundled OpenAI-compatible mock.
- Mock endpoint follows `SMOKE_MOCK_BASE_URL` (default: `http://host.docker.internal:18081/v1`).
- If nothing is listening, `smoke.sh` launches `scripts/openai-compatible-mock.mjs` automatically and stores logs under the run artifacts folder.

To run against a real model endpoint instead of the bundled mock:

```bash
SMOKE_USE_OPENAI_MOCK=false ./scripts/smoke.sh dev
```

Smoke test validates:
- health and readiness
- register -> login -> create-session -> stream-chat
- archives deployment evidence under `artifacts/smoke/<env>/<timestamp>/`
- renders `release-report.tex` automatically and can optionally compile PDF

### 4) Rollback
```bash
# rollback to previously deployed tag
./scripts/rollback.sh dev

# rollback to specific tag
./scripts/rollback.sh dev 20260427153000
```

## Docker Services

`docker-compose.yml` starts the default services `postgres`, `redis`, `python-service`, and
`backend` (Spring Boot API). Optional services are profile-gated:
- Kafka: `docker compose --profile kafka up -d`
- Milvus dependencies: `docker compose --profile milvus up -d`
- Prometheus/Grafana/node exporter: `docker compose --profile monitoring up -d`

The backend image uses the repository Maven reactor and may need the private FlexAgent package.
The checked-in `.mvn/settings.xml` contains environment-variable placeholders, not credentials.
For a credentialed BuildKit build, provide a real settings file path and credentials only for the
command; none are written to the repository or image layers. The settings file contains no
credentials; BuildKit injects the two credential values only into the Maven build process through
secret environment mounts. This example copies the placeholder settings to a temporary file and
removes it when the command exits:

```bash
tmp_settings="$(mktemp)"
trap 'rm -f "$tmp_settings"' EXIT
cp .mvn/settings.xml "$tmp_settings"
GITHUB_ACTOR="${GITHUB_ACTOR:?GitHub Packages username}" \
GITHUB_TOKEN="${GITHUB_TOKEN:?GitHub Packages read token}" \
docker build \
  --tag "${BACKEND_IMAGE_REPO:-ai-agent-backend}:${APP_IMAGE_TAG:-latest}" \
  --secret "id=maven_settings,src=${tmp_settings}" \
  --secret id=github_actor,env=GITHUB_ACTOR \
  --secret id=github_token,env=GITHUB_TOKEN \
  -f backend/Dockerfile .
```

The Compose `config --quiet` validation intentionally does not bind a local secret file;
use the direct BuildKit command, or `scripts/deploy.sh` with the same inputs, when building
the private FlexAgent image. A missing settings file or credential fails before deployment.

Kafka is an independent infrastructure/profile choice. The default backend does not create Kafka
topics; start Kafka separately and set `SPRING_PROFILES_ACTIVE=mq` plus
`SPRING_KAFKA_BOOTSTRAP_SERVERS` only for an MQ deployment.

Default URLs:
- Backend: `http://localhost:8080`
- Readiness: `http://localhost:8080/api/v1/system/health/ready`

## Local Development (without Compose)

### Backend
```bash
cd backend
mvn spring-boot:run
```

### Desktop Renderer
```bash
cd desktop/src/renderer-vue
npm install
npm run dev
```

### Desktop App
```bash
cd desktop
npm install
npm run dev
```

In development, Electron loads `DESKTOP_RENDERER_URL` or `http://localhost:5173` by default. Packaged builds load `desktop/dist/renderer/index.html`.

### TS CLI
```bash
cd ts-cli
npm install
npm run build

# login
node dist/index.js login --email you@example.com --password your_password --base-url http://localhost:8080

# create session
node dist/index.js create-session --provider OPENAI --model gpt-4o-mini

# sync chat
node dist/index.js chat --message "总结当前项目结构"

# streaming chat
node dist/index.js stream-chat --message "请给出一个简短状态总结"

# Ink REPL
node dist/index.js

# tool stats (table)
node dist/index.js tool-stats --window-hours 24 # legacy opt-in

# tool stats (json / markdown)
node dist/index.js tool-stats --window-hours 24 --json
node dist/index.js tool-stats --window-hours 24 --markdown

# release report (summary / json / markdown)
node dist/index.js release-report --window-hours 24 # legacy opt-in
node dist/index.js release-report --window-hours 24 --json
node dist/index.js release-report --window-hours 24 --markdown
```

### Release report rendering
```bash
# render LaTeX from a saved release-report.json
./scripts/render-release-report.sh \
  --input-json artifacts/smoke/dev/20260428120000/release-report.json \
  --output-dir artifacts/smoke/dev/20260428120000

# if tectonic is available, also compile PDF
SMOKE_RENDER_PDF=true ./scripts/smoke.sh dev
```

## API Summary

### Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`

### Sessions
- `POST /api/v1/sessions`
- `GET /api/v1/sessions`
- `GET /api/v1/sessions/{id}/messages`
- `GET /api/v1/sessions/{id}/export?format=json|markdown`

### Agent
- `POST /api/v1/agent/chat`
- `POST /api/v1/agent/chat/stream` (SSE, includes `event: heartbeat`)

### Dev Coach
- These Coach endpoints are available in the backend, but they are a supporting module rather than the primary Knowledge Desk desktop flow.
- `POST /api/v1/coach/requirements/breakdown`
- `POST /api/v1/coach/scaffolds`
- `GET /api/v1/coach/scaffolds/{id}/download`
- `POST /api/v1/coach/logs/diagnose`
- `GET /api/v1/coach/runs`

### System
- `GET /api/v1/system/models`
- `GET /api/v1/system/health/ready`
- `GET /api/v1/system/tool-stats?windowHours=24&sessionId=<optional>` (legacy opt-in)
- `GET /api/v1/system/tool-stats/export?windowHours=24&sessionId=<optional>&format=json|markdown` (legacy opt-in)
- `GET /api/v1/system/release-report?windowHours=24&sessionId=<optional>` (legacy opt-in)
- `GET /api/v1/system/release-report/export?windowHours=24&sessionId=<optional>&format=json|markdown` (legacy opt-in)

The default smoke test checks only default APIs. Set `SMOKE_ENABLE_LEGACY=true` to invoke
Tool Stats and Release Report and generate their artifacts. To enable the legacy API runtime,
set `SPRING_PROFILES_ACTIVE=legacy` and provide the required Sentinel receiver owner/token
configuration.

### Desktop Computer Use
> 可选模块：该能力属于 Codex 对齐演进线，打包 Beta 默认不启用（见 [产品主线与模块边界](docs/arch/000-product-line.md)）。
- Desktop exposes macOS-only `computer_use` tool actions through approval-gated IPC:
  `permissions`, `screenshot`, `click`, `type`, `keypress`, and `scroll`.
- macOS users must grant Screen Recording and Accessibility permissions before screenshot/input actions work.

## Config Layering

Templates:
- `env/dev.env.example`
- `env/staging.env.example`
- `env/prod.env.example`

Key runtime knobs:
- `SMOKE_USE_OPENAI_MOCK`
- `SMOKE_MOCK_BASE_URL`
- `SMOKE_MOCK_BIND_HOST`
- `SMOKE_MOCK_STARTUP_TIMEOUT_SECONDS`
- `MODEL_CONNECT_TIMEOUT_MS`
- `MODEL_READ_TIMEOUT_MS`
- `MODEL_TOTAL_TIMEOUT_MS`
- `MODEL_IDEMPOTENT_RETRIES`
- `CHAT_RATE_LIMIT_PER_MIN`
- `LOGIN_RATE_LIMIT_PER_MIN`
- `CORS_ALLOWED_ORIGINS`
- `STARTUP_VALIDATION_FAIL_FAST`
- `SMOKE_REPORT_WINDOW_HOURS`
- `SMOKE_RENDER_PDF`
- `SMOKE_ARTIFACTS_DIR`
- `TECTONIC_BIN`

## Kubernetes Secrets

Kubernetes manifests reference an externally managed `app-secrets` Secret. Required keys are
`POSTGRES_PASSWORD`, `JWT_SECRET`, `SECURITY_DB_ENCRYPTION_KEY`, and `OPENAI_API_KEY`.
`SECURITY_DB_LEGACY_ENCRYPTION_KEY` is optional and is used only during key rotation.
Sentinel forwarding optionally uses `BUG_SENTINEL_TOKEN` and
`BUG_SENTINEL_OWNER_USER_ID`.

```bash
kubectl create secret generic app-secrets \
  --from-literal=POSTGRES_PASSWORD='<replace-with-postgres-password>' \
  --from-literal=JWT_SECRET='<replace-with-at-least-32-random-characters>' \
  --from-literal=SECURITY_DB_ENCRYPTION_KEY='<replace-with-at-least-32-random-characters>' \
  --from-literal=OPENAI_API_KEY='<replace-with-provider-key>'
```

Prometheus uses `/actuator/prometheus`, which remains authenticated and should be protected by
appropriate scrape credentials or network policy. Readiness probes use the public
`/api/v1/system/health/ready` endpoint.

## Notes
- Error payloads include `requestId` for traceability.
- Structured logging includes `requestId/userId/sessionId`.
- TS CLI state is stored under `~/.ai-agent-cli/state.json` with restrictive permissions on POSIX systems.
- Desktop/CLI surfaces include tool stats filters (`1h/24h/7d`, current-session/global) with one-click refresh/export paths.
- Desktop/CLI surfaces support exporting tool stats and release reports as JSON/Markdown.
- Chat errors expose next-step action buttons (re-login, retry, switch fallback model) where the active client supports them.
- Rate-limit chat failures trigger a short countdown auto-retry.
- TS CLI `stream-chat` prints stream status (`connecting`, `meta`, `done`) and collects a sanitized repo context.
- TS CLI includes an Ink REPL with slash commands such as `/login`, `/sessions`, `/new`, `/stats`, and `/report`.
- TS CLI `tool-stats` and `release-report` support summary/json/markdown output with optional session filter.
- `smoke.sh` now saves readiness, models, SSE stream, session export, tool stats, and release report artifacts for each run.
- `render-release-report.sh` always emits a `.tex` handoff and compiles PDF when `tectonic` is available.
