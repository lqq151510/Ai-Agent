# Java AI Agent MVP (Beta Delivery Baseline)

This repo delivers a runnable Beta stack:
- `backend`: Spring Boot API (JWT auth, sessions, SSE chat, system readiness/models API)
- `web`: React + TypeScript frontend (white minimal UI, streaming status/retry)
- `cli`: Java Picocli client (`chat` and `stream-chat`)
- `docker-compose`: one-command single-host deployment with PostgreSQL + Redis

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
```bash
./scripts/deploy.sh dev
```

### 3) Smoke test
```bash
./scripts/smoke.sh dev
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
- `web` (nginx static + `/api` reverse proxy)
- `backend` (Spring Boot)
- `postgres`
- `redis`

Default URLs:
- Web: `http://localhost:8088`
- Backend: `http://localhost:8080`
- Readiness: `http://localhost:8080/api/system/health/ready`

## Local Development (without Compose)

### Backend
```bash
cd backend
mvn spring-boot:run
```

### Web
```bash
cd web
npm install
npm run dev
```

### CLI
```bash
cd cli

# login
mvn -q exec:java -Dexec.args="login --email you@example.com --password your_password --base-url http://localhost:8080"

# create session
mvn -q exec:java -Dexec.args="create-session --provider OPENAI --model qwen/qwen3.5-9b"

# sync chat
mvn -q exec:java -Dexec.args="chat --message '总结当前项目结构'"

# streaming chat
mvn -q exec:java -Dexec.args="stream-chat --message '请给出一个简短状态总结'"

# tool stats (table)
mvn -q exec:java -Dexec.args="tool-stats --window-hours 24"

# tool stats (json / markdown)
mvn -q exec:java -Dexec.args="tool-stats --window-hours 24 --json"
mvn -q exec:java -Dexec.args="tool-stats --window-hours 24 --markdown"

# release report (summary / json / markdown)
mvn -q exec:java -Dexec.args="release-report --window-hours 24"
mvn -q exec:java -Dexec.args="release-report --window-hours 24 --json"
mvn -q exec:java -Dexec.args="release-report --window-hours 24 --markdown"
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
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### Sessions
- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/{id}/messages`
- `GET /api/sessions/{id}/export?format=json|markdown`

### Agent
- `POST /api/agent/chat`
- `POST /api/agent/chat/stream` (SSE, includes `event: heartbeat`)

### Dev Coach
- `POST /api/coach/requirements/breakdown`
- `POST /api/coach/scaffolds`
- `GET /api/coach/scaffolds/{id}/download`
- `POST /api/coach/logs/diagnose`
- `GET /api/coach/runs`

### System
- `GET /api/system/models`
- `GET /api/system/health/ready`
- `GET /api/system/tool-stats?windowHours=24&sessionId=<optional>`
- `GET /api/system/tool-stats/export?windowHours=24&sessionId=<optional>&format=json|markdown`
- `GET /api/system/release-report?windowHours=24&sessionId=<optional>`
- `GET /api/system/release-report/export?windowHours=24&sessionId=<optional>&format=json|markdown`

## Config Layering

Templates:
- `env/dev.env.example`
- `env/staging.env.example`
- `env/prod.env.example`

Key runtime knobs:
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
- CLI state is stored under `~/.ai-agent-cli/state.json` with restrictive permissions on POSIX systems.
- Web sidebar includes tool stats filters (`1h/24h/7d`, current-session/global) with one-click refresh.
- Web sidebar supports exporting tool stats as JSON/Markdown.
- Web sidebar supports exporting release reports as JSON/Markdown.
- Web chat errors expose next-step action buttons (re-login, retry, switch fallback model).
- Rate-limit chat failures trigger a short countdown auto-retry.
- CLI `stream-chat` prints stream status (`connecting`, `first token`, `done`) and friendlier failure hints.
- CLI `tool-stats` supports table/json/markdown output with optional session filter.
- CLI `release-report` supports summary/json/markdown output with optional session filter.
- `smoke.sh` now saves readiness, models, SSE stream, session export, tool stats, and release report artifacts for each run.
- `render-release-report.sh` always emits a `.tex` handoff and compiles PDF when `tectonic` is available.
