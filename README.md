# Java AI Agent MVP (Beta Delivery Baseline)

This repo delivers a runnable Beta stack:
- `backend`: Spring Boot API (JWT auth, sessions, SSE chat, system readiness/models API)
- `desktop`: Electron + React desktop client, including threads, review, skills, terminal, and Computer Use entrypoints
- `ts-cli`: TypeScript + React (Ink) terminal client
- `docker-compose`: single-host backend stack with PostgreSQL, Redis, Kafka, Milvus, Python parsing service, and monitoring

## AI + Java Dev Coach MVP

The product now includes a first-pass "AI + Java development cockpit" for students and Java AI developers:

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

For `prod`, create `env/prod.env` with real secrets first. Production deploy/rollback refuses to use `env/prod.env.example`.

```bash
./scripts/release-check.sh prod
```

Then deploy:

```bash
./scripts/deploy.sh dev
```
`deploy.sh` runs `scripts/check-consistency.sh` before building so API path drift is caught early. When `SMOKE_USE_OPENAI_MOCK=true`, it also overrides backend OpenAI endpoint to the local mock URL.

CI runs the same `scripts/release-check.sh dev` gate, so pull requests and local release checks fail on the same class of runtime dependency audit, build, desktop, Compose, and config regressions.
Additionally, the GitHub Actions CI pipeline enforces the following code quality and safety gates:
- **JaCoCo Coverage**: Enforces minimum line and branch coverage requirements.
- **Spotless Formatting**: Fails the build if Java code is not formatted according to the project style guidelines.
- **Main Process Tests**: Runs the Electron main process tests.
- **Full Safety Audit**: Prevents legacy/development tool exposures in production builds.

To include Electron directory packaging in the local gate:

```bash
RELEASE_CHECK_PACKAGE_DESKTOP=true ./scripts/release-check.sh dev
```

Desktop packaging requires Node.js 18-22. The packaged app is checked for `app.asar`, embedded `backend-jre`, `ts-cli`, `local-service`, and accidental build-time dependencies.

To generate and verify the current macOS architecture distributables (`.dmg` and `.zip`):

```bash
RELEASE_CHECK_DESKTOP_DISTRIBUTABLE=true ./scripts/release-check.sh dev
```

This also writes release evidence under `desktop/release/`:
- `release-manifest.json`: version, git commit, artifact sizes/checksums, and macOS app trust status
- `SHA256SUMS`: publishable SHA-256 checksums for generated installers

Local unsigned builds only emit signing/Gatekeeper warnings. For a real macOS release, enforce trust checks explicitly:

```bash
RELEASE_CHECK_DESKTOP_DISTRIBUTABLE=true \
RELEASE_CHECK_REQUIRE_MAC_SIGNING=true \
RELEASE_CHECK_REQUIRE_MAC_GATEKEEPER=true \
./scripts/release-check.sh prod
```

To regenerate evidence for existing artifacts without rebuilding:

```bash
./scripts/release-manifest.sh
```

To run the release gate against existing distributables without rebuilding DMG/ZIP:

```bash
RELEASE_CHECK_DESKTOP_DISTRIBUTABLE=true \
RELEASE_CHECK_REUSE_DESKTOP_DISTRIBUTABLE=true \
./scripts/release-check.sh dev
```

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

`docker-compose.yml` starts:
- `backend` (Spring Boot API)
- `python-service` (FastAPI document parsing/evaluation support)
- `postgres`
- `redis`
- `kafka`
- Milvus dependencies from `milvus-dc.yml`
- Prometheus/Grafana monitoring

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
cd desktop/src/renderer
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
node dist/index.js create-session --provider OPENAI --model qwen/qwen3.5-9b

# sync chat
node dist/index.js chat --message "总结当前项目结构"

# streaming chat
node dist/index.js stream-chat --message "请给出一个简短状态总结"

# Ink REPL
node dist/index.js

# tool stats (table)
node dist/index.js tool-stats --window-hours 24

# tool stats (json / markdown)
node dist/index.js tool-stats --window-hours 24 --json
node dist/index.js tool-stats --window-hours 24 --markdown

# release report (summary / json / markdown)
node dist/index.js release-report --window-hours 24
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
- `POST /api/v1/coach/requirements/breakdown`
- `POST /api/v1/coach/scaffolds`
- `GET /api/v1/coach/scaffolds/{id}/download`
- `POST /api/v1/coach/logs/diagnose`
- `GET /api/v1/coach/runs`

### System
- `GET /api/v1/system/models`
- `GET /api/v1/system/health/ready`
- `GET /api/v1/system/tool-stats?windowHours=24&sessionId=<optional>`
- `GET /api/v1/system/tool-stats/export?windowHours=24&sessionId=<optional>&format=json|markdown`
- `GET /api/v1/system/release-report?windowHours=24&sessionId=<optional>`
- `GET /api/v1/system/release-report/export?windowHours=24&sessionId=<optional>&format=json|markdown`

### Desktop Computer Use
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
