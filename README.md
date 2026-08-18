# AI Agent Knowledge Desk

AI Agent Knowledge Desk is a local-first desktop knowledge application and a full-stack AI portfolio project. Its primary deliverable is the Electron desktop app backed by Spring Boot; the repository also contains a TypeScript CLI and an optional deployable server stack.

## Personal desktop Beta scope

- The macOS installer bundles the backend JAR and a Java runtime, and starts a local H2 database automatically. Normal desktop use does not require a separate Java, PostgreSQL, or Docker installation.
- Knowledge capture, import, search, tagging, review, backup, and restore work without a model provider.
- AI organization and assistant features require a user-configured local OpenAI-compatible endpoint on `localhost`, `127.0.0.1`, or `::1`.
- The backend contains OpenAI, DeepSeek, OpenRouter, Anthropic, and generic OpenAI-compatible provider integrations, but the current Knowledge Desk desktop flow deliberately exposes only local providers. Third-party cloud API configuration is not part of this personal Beta.
- API keys stored by the backend use encrypted model-source persistence and are excluded from Knowledge Desk backups.

Repository components:

- `backend`: Spring Boot API for authentication, knowledge workflows, model sources, sessions, and SSE chat
- `desktop`: Electron + React desktop client with a bundled standalone runtime
- `python-service`: local document parsing service
- `ts-cli`: TypeScript + React (Ink) terminal client
- `docker-compose`: optional single-host server stack with PostgreSQL, Redis, Kafka, Milvus, parsing, and monitoring

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
- **JaCoCo Coverage**: Enforces minimum line and branch coverage requirements.
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

This diagnostic must not be published. A real macOS release requires an exact version tag, a clean source tree, GitHub Packages access, and the signing/notarization environment variables. Use the canonical gate (or `desktop/scripts/build-all.sh --release`, which delegates to it):

```bash
GITHUB_ACTOR=<github-user> GITHUB_TOKEN=<packages-read-token> \
CSC_LINK=<base64-p12-or-path> CSC_KEY_PASSWORD=<certificate-password> \
APPLE_ID=<apple-id> APPLE_APP_SPECIFIC_PASSWORD=<app-password> \
APPLE_TEAM_ID=<team-id> \
./scripts/release-check-macos.sh
```

### macOS Beta candidate workflow

Personal `-beta.` tags use a locally built, explicitly unsigned DMG/ZIP and a manually reviewed GitHub prerelease. The tag must still match `desktop/package.json`, point to a commit reachable from `origin/main`, and be created only after the local release gate and main-branch CI pass.

Non-beta tags enter the `macOS Release Candidate` GitHub Actions job. That formal path requires the GitHub `release` Environment, Developer ID signing credentials, notarization, Gatekeeper validation, checksums, and release-manifest verification before it creates a draft release. Personal Beta convenience does not weaken the formal release gate.

The packaged beta deliberately excludes legacy developer tooling, including Computer Use, even if `AI_AGENT_ENABLE_LEGACY_DEVTOOLS=1` is supplied at runtime. That capability remains source-checkout-only until its approval, window allowlist, and screenshot privacy controls are production-ready.

See [the macOS beta release checklist](docs/release/macos-beta.md) for local Beta packaging, formal signed-release requirements, tag provenance, review, and rollback steps.

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
