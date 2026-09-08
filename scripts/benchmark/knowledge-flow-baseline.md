# Knowledge Desk 核心链路现场基线（导入 → 整理 → 检索 → 复习 → 助手）

> 本文件记录 **一次真实运行** 的证据，不是设计稿。所有命令与输出均在下列环境中实跑得到。
> 与 `docs/portfolio/BENCHMARK_REPORT.md`（离线蒙特卡洛推演）不同，本文是物理进程上的实测记录。

## 1. 元信息

| 项 | 值 |
| --- | --- |
| 仓库 | `AI-agent`（AI Agent Knowledge Desk 0.1.0-beta.3） |
| Git HEAD | `5c8adf7`（2026-09-08，工作树含本轮 WS1–WS6 未提交改动） |
| JDK | 21.0.10 LTS（`/Users/liuyongze/java/jdk-21.0.10.jdk/Contents/Home`） |
| 运行 profile | `desktop`（内嵌 H2 文件库 + Flyway `classpath:db/h2` + Caffeine 取代 Redis） |
| 后端 | `backend/target/backend-0.1.0-beta.3.jar`，`-Pdesktop` 打包，端口 `18080` |
| 模型 | 进程内 OpenAI 兼容 mock（`scripts/openai-compatible-mock.mjs`，端口 `18081`，模型 `qwen/qwen3.5-9b`） |
| 数据目录 | 临时目录（`/tmp/kd-smoke-<ts>`），不污染 `~/.ai-agent-desktop` |
| 操作系统 | macOS 26.6.2 / arm64 |

启动命令（可复现）：

```bash
export JAVA_HOME=/Users/liuyongze/java/jdk-21.0.10.jdk/Contents/Home
export PATH="/opt/homebrew/bin:$JAVA_HOME/bin:$PATH"
cd /Users/liuyongze/Documents/AI-agent

RUN=/tmp/kd-smoke-$(date +%Y%m%d-%H%M%S); mkdir -p "$RUN/workspace"

# 1) 模型 mock
MOCK_OPENAI_HOST=127.0.0.1 MOCK_OPENAI_PORT=18081 MOCK_OPENAI_MODEL=qwen/qwen3.5-9b \
  nohup node scripts/openai-compatible-mock.mjs > "$RUN/mock.log" 2>&1 &

# 2) 后端（desktop profile）
APP_DATA_DIR="$RUN" WORKSPACE_ROOT="$RUN/workspace" SERVER_PORT=18080 \
OPENAI_BASE_URL=http://127.0.0.1:18081/v1 OPENAI_API_KEY=sk-smoke \
MODEL_PROVIDER=OPENAI OPENAI_MODEL=qwen/qwen3.5-9b \
  nohup "$JAVA_HOME/bin/java" -jar backend/target/backend-0.1.0-beta.3.jar \
    --spring.profiles.active=desktop > "$RUN/backend.log" 2>&1 &
```

就绪探针（约 8 秒内就绪）：

```json
{"ready":true,"checks":[
  {"name":"database","ok":true,"detail":"ok"},
  {"name":"redis","ok":true,"detail":"redis is disabled (using memory cache)"},
  {"name":"model","ok":true,"detail":"OpenAI-compatible endpoint reachable: discovered 1 model(s)"}]}
```

## 2. 结论摘要

1. **五步链路在 desktop profile 上完整跑通**：导入 → 整理 → 检索 → 复习 → 助手（含流式与导出），全部为真实 HTTP 调用。
2. ~~**`scripts/smoke.sh` 当前无法跑完**：第一步 `GET /actuator/health` 返回 **401**，`set -euo pipefail` + `curl -f` 直接中止。这是**回归**，不是环境问题（见 §3.2 根因）。~~ → **已由 t11 修复（方案 B）**：脚本改用 `/api/v1/system/health/ready`，并保留一次非致命的 `/actuator/health/liveness` 探针；`bash scripts/smoke.sh` 现已端到端通过（见 §3.1b）。原始 401 记录保留在 §3.1/§3.2 作为历史证据。
3. 复习队列的**安全精简 DTO** 现场验证通过：响应中不含 `rawContent` / `sourceUri` / `contentHash` / `sourceAsset`。
4. 现场 mock **没有** `/v1/embeddings`，因此现场环境的助手不会把导入资料注入上下文；"知识进入助手上下文"的断言由离线 JUnit e2e 覆盖（见 §4），本文不夸大现场结论。

## 3. 现场实跑记录

### 3.1 `scripts/smoke.sh` 修复前的真实输出（历史证据，未删减）

```text
$ SMOKE_BASE_URL=http://127.0.0.1:18080 \
  SMOKE_MOCK_BASE_URL=http://127.0.0.1:18081/v1 \
  SMOKE_USE_OPENAI_MOCK=true \
  bash scripts/smoke.sh dev

[consistency] API and readiness path checks passed
[smoke] detected existing OpenAI-compatible mock at http://127.0.0.1:18081/v1
[smoke] BASE_URL=http://127.0.0.1:18080
[smoke] artifacts=/Users/liuyongze/Documents/AI-agent/artifacts/smoke/dev/20260908155011
[smoke] checking health endpoints
curl: (22) The requested URL returned error: 401
```

注意两点：

- `SMOKE_ARTIFACTS_DIR` 会被 `scripts/smoke.sh` 内部 `source env/dev.env`（其中该变量为空）覆盖，因此产物目录实际落在仓库 `artifacts/smoke/dev/<ts>/`。
- 脚本在 `scripts/smoke.sh:173` 的 `fetch_to_file "${BASE_URL}/actuator/health"` 处中止，后续 register/login/session/stream 全部未执行。

### 3.1b `scripts/smoke.sh` 修复后的真实输出（t11 验收）

```text
$ SMOKE_BASE_URL=http://127.0.0.1:18080 \
  SMOKE_MOCK_BASE_URL=http://127.0.0.1:18081/v1 \
  SMOKE_USE_OPENAI_MOCK=true \
  bash scripts/smoke.sh

[consistency] API and readiness path checks passed
[smoke] detected existing OpenAI-compatible mock at http://127.0.0.1:18081/v1
[smoke] BASE_URL=http://127.0.0.1:18080
[smoke] artifacts=/Users/liuyongze/Documents/AI-agent/artifacts/smoke/dev/20260908155721
[smoke] checking health endpoints
[smoke] liveness probe ok
[smoke] running register -> login -> create-session -> stream-chat
[smoke] all checks passed
[smoke] artifacts saved to /Users/liuyongze/Documents/AI-agent/artifacts/smoke/dev/20260908155721
```

产物：`readiness.json`、`actuator-liveness.json`、`models.json`、`session-id.txt`、`stream.sse`、`session-export.json`、`session-export.md`、`run-summary.txt`。

### 3.2 401 的根因（已定位到提交）

```text
$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18080/actuator/health
401
$ curl -s http://127.0.0.1:18080/api/v1/system/health/ready
{"ready":true, ...}          # 200，公开
```

`backend/src/main/java/com/agent/mvp/config/SecurityConfig.java` 的放行清单只包含：

```java
"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/refresh",
"/api/v1/system/health/ready", "/actuator/health/liveness"
```

而 `JwtAuthenticationFilter.shouldNotFilter()` 仍显式跳过 `/actuator/health`（说明原始意图是"公开"）——**意图与授权配置不一致**。

Git 历史定位：

| 提交 | 日期 | 变化 |
| --- | --- | --- |
| `11e8eb0` | 2026-04-29 | 初始：`/actuator/health/**` 放行 |
| `9799777` | 2026-05-23 | 路径加 `/api/v1` 前缀，`/actuator/health/**` 仍放行 |
| `ed1e991` | 2026-06-11 | **收窄为 `/actuator/health/liveness`** → `/actuator/health` 变 401 |
| 今天 | 2026-09-08 | `artifacts/smoke/dev/20260908155011/` 为空目录（脚本第一步即中止） |

历史产物可交叉验证：`artifacts/smoke/dev/20260526164134/actuator-health.json` 是 `{"status":"UP","components":{...}}`（200），时间点在收窄之前；2026-06-11 之后的运行再无完整产物。

影响面：

- `scripts/smoke.sh`（仓库主烟测脚本）从 2026-06-11 起实际不可用；
- Kubernetes 探针不受影响：`k8s/backend-deployment.yaml` 的 liveness 用 `/actuator/health/liveness`（放行），readiness 用 `/api/v1/system/health/ready`（放行）；
- `docker-compose.yml` 的 backend healthcheck 用 `/api/v1/system/health/ready`，也不受影响。

修复方向（t11 采用方案 B，见 §3.1b）：

- ~~在 `SecurityConfig` 放行清单补回 `/actuator/health`（与 `JwtAuthenticationFilter` 的既有意图对齐）；~~（**不采用**：会扩大公开面）
- ✅ 把 `scripts/smoke.sh:173` 改为抓取 `/api/v1/system/health/ready`，并保留一次非致命的 `/actuator/health/liveness` 探针（t11 已实施）。

### 3.3 手工等价链路实录（修复前用于替代被中止的 smoke 后半段，修复后仍是知识链路的现场证据）

```text
### 2) register POST /api/v1/auth/register
http_status=200
{"id":"7493c435-5996-43a1-9b35-8a5245eadb3c","email":"live.kd-live-1788853830@example.com",
 "createdAt":"2026-09-08T07:50:31.131305Z","customBaseUrl":null,"customApiKey":null}

### 3) login POST /api/v1/auth/login
http_status=200 accessToken_len=281
{"accessToken":"...","expiresInSeconds":86400,"refreshToken":"..."}

### 4) 导入 POST /api/v1/knowledge-items/import/snippet
{"id":"a7444b24-ebd4-4a41-9edf-96bf02d676ef","sourceType":"snippet","status":"inbox",
 "wordCount":5,"title":"现场链路样本 KD-LIVE-1788853830"}

### 5) 整理 POST /api/v1/knowledge-items/{id}/organize
{"id":"a7444b24-ebd4-4a41-9edf-96bf02d676ef","status":"ready","language":"zh","wordCount":5,
 "summary":"这是 desktop profile 现场导入的知识正文，标记 KD-LIVE-1788853830，用于验证导入→整理",
 "tags":["snippet","现场链路样本","desktop","这是","kd-live-1788853830"]}

### 6) 检索 GET /api/v1/knowledge-items/search?q=KD-LIVE-1788853830
{"total":1,"ids":["a7444b24-ebd4-4a41-9edf-96bf02d676ef"],"statuses":["ready"]}

### 7) 复习队列 GET /api/v1/knowledge-reviews/queue?limit=10
{"dueCount":1,"items":[{"id":"a7444b24-...","title":"现场链路样本 KD-LIVE-1788853830",
 "intervalDays":null,"easeFactor":null,"repetitions":null}]}
--- 安全断言：队列响应不得含 rawContent/sourceUri/contentHash/sourceAsset
ok: 无 rawContent
ok: 无 sourceUri
ok: 无 contentHash
ok: 无 sourceAsset

### 8) 提交复习 POST /api/v1/knowledge-reviews/{itemId}/complete rating=good
{"knowledgeItemId":"a7444b24-ebd4-4a41-9edf-96bf02d676ef","rating":"good",
 "dueAt":"2026-09-09T07:50:31.491558Z","intervalDays":1,"easeFactor":2.5,"repetitions":1}

### 9) 首页摘要 GET /api/v1/dashboard/summary
{"totalItems":1,"inboxItems":0,"readyItems":1,"failedItems":0,
 "review":{"dueCount":0,"nextDueAt":"2026-09-09T07:50:31.491558Z"},
 "topTags":["desktop","kd-live-1788853830","snippet","现场链路样本","这是"]}

### 10) 助手：创建会话 POST /api/v1/sessions
{"id":"81f841a2-8757-4c18-9b10-5ad6558a1d3e","provider":"OPENAI",
 "model":"qwen/qwen3.5-9b","title":"现场助手会话"}

### 11) 助手：同步对话 POST /api/v1/agent/chat
{"sessionId":"81f841a2-8757-4c18-9b10-5ad6558a1d3e","reply":"smoke ok"}

### 12) 助手：流式对话 POST /api/v1/agent/chat/stream
http_status=200
SSE 事件统计:
   1 event:chunk
   1 event:done
   2 event:meta
SSE 前 6 行:
event:meta
data:{"sessionId":"81f841a2-...","provider":"OPENAI","model":"qwen/qwen3.5-9b",
      "toolTraces":[],"phase":"started","execution":{...}}

event:chunk
data:smoke ok

### 13) 会话导出 GET /api/v1/sessions/{id}/export?format=markdown
http_status=200 content_type=text/markdown
     625 /tmp/export.md
# 现场助手会话

- Session ID: 81f841a2-8757-4c18-9b10-5ad6558a1d3e
- Provider/Model: OPENAI/qwen/qwen3.5-9b
- Task Type: chat

### 14) 助手回复是否引用导入资料（现场观测）
/tmp/stream.sse:0
/tmp/export.md:2
```

说明：`event:meta` 出现两次是**设计如此**（`phase:started` 与 `phase:completed`），不是重复事件。

## 4. 离线 JUnit e2e（可 CI 复跑，长期资产）

新增 `backend/src/test/java/com/agent/mvp/e2e/KnowledgeDeskJourneyE2ETest.java`，4 个用例：

| 用例 | 覆盖 |
| --- | --- |
| `knowledgeDeskFiveStepJourney` | 导入(snippet/web/file + preflight + 400 边界) → 整理(单条/batch/reprocess + 归档 400) → 检索(search/list/详情/标签写入与幂等) → 复习(queue 安全 DTO/complete 精确间隔/400) → 助手(会话/同步/流式/导出 + **知识进入 system prompt**) |
| `reviewRejectsCrossUserAndNonReadyItems` | 他人条目 403、归档条目 400、非法 rating 400 |
| `knowledgeEndpointsRequireAuthentication` | 未认证 401 |
| `fiveStepLatencyBaseline` | 五步端点 p50/p90/p99 采样并落盘 |

运行命令：

```bash
mvn -o -pl backend -Pdesktop -Djacoco.skip=true \
  -Dtest=KnowledgeDeskJourneyE2ETest -Dsurefire.failIfNoSpecifiedTests=false test
```

实测结果：`Tests run: 4, Failures: 0, Errors: 0`。

关键断言与现场差异：JUnit 测试自带 mock **实现了 `/v1/embeddings`**（384 维、确定性向量），因此可以断言"整理时异步入库的知识正文，在助手对话时出现在发往模型的 system prompt 中"（`model_calls_observed` 证明走的是真实模型往返）。现场 mock 缺该端点，故现场只能验证"助手可用"。

## 5. 发现清单（本轮只记录，未修改源码）

| # | 级别 | 发现 | 证据 | 建议 |
| --- | --- | --- | --- | --- |
| F1 | 高 | `scripts/smoke.sh` 第一步 `GET /actuator/health` 返回 401，主烟测脚本自 2026-06-11 起不可用 | §3.1/§3.2，提交 `ed1e991` 收窄放行清单 | ✅ **t11 已修（方案 B）**：smoke.sh 改用 `/api/v1/system/health/ready` + 非致命 liveness 探针，见 §3.1b |
| F2 | 中 | 助手 system prompt 仍是 `"You are a Java AI coding assistant..."`，检索结果挂在 `"historical log diagnoses"` 标题下，与"Knowledge Desk 主线"口径不一致 | `AgentContextService.buildMessages` + `RAGMemoryService.searchSimilarDiagnoses` | 口径修正或写入已知行为缺口（已同步 docs-lead） |
| F3 | 低 | `wordCount` 用 `split("\\s+")` 统计，中文正文无空格 → 约 40 字正文只记 5 "词" | `KnowledgeOrganizerService.countWords` + §3.3 步骤 4/5 实测 | ✅ **t11 已修**：新增 `WordCounter`（CJK 按字 + 拉丁/数字按词），`KnowledgeOrganizerService` 与 `KnowledgeItemService` 共用；单测 `WordCountTest`（8 例） |

## 6. 复现步骤

```bash
# 1) 离线 e2e + 基线（不需要 Docker / 不需要外网）
export JAVA_HOME=/Users/liuyongze/java/jdk-21.0.10.jdk/Contents/Home
cd /Users/liuyongze/Documents/AI-agent
mvn -o -pl backend -Pdesktop -Djacoco.skip=true \
  -Dtest=KnowledgeDeskJourneyE2ETest -Dsurefire.failIfNoSpecifiedTests=false test
# 产物：artifacts/e2e/<ts>/baseline.json

# 2) 现场链路（需要先启动 mock 与 desktop profile 后端，见 §1）
SMOKE_BASE_URL=http://127.0.0.1:18080 \
SMOKE_MOCK_BASE_URL=http://127.0.0.1:18081/v1 \
SMOKE_USE_OPENAI_MOCK=true bash scripts/smoke.sh        # t11 修复后：端到端通过（见 §3.1b）
```
