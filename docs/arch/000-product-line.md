# 产品主线与模块边界（单一事实来源）

> 版本：v1.0 | 日期：2026-09-08 | 状态：生效
> 适用仓库：`/Users/liuyongze/Documents/AI-agent`，版本 `0.1.0-beta.4`（2026-09-08 由 beta.3 收口，见 `docs/release/beta-closeout-report.md`），基线 commit `590f7d9`（branch `main`）

---

## 1. 一句话定位

**主产品 = AI Agent Knowledge Desk**：一个 local-first 的个人知识工作台，以 macOS Electron 桌面应用为交付形态，随包内置 Spring Boot 后端、H2 数据库与 JRE。正常桌面使用不需要用户单独安装 Java、PostgreSQL 或 Docker。

核心闭环：**收集 → Inbox 整理 → AI 元数据增强 → Library 浏览/搜索 → Detail 回看（保留来源上下文）**。这不是一个以聊天为主入口的产品。

## 2. 主线交付面（默认随桌面版发布）

| 组成 | 状态 | 入口 |
| --- | --- | --- |
| 桌面渲染层（Knowledge Desk） | 已实现，主界面 | `desktop/src/renderer/src/App.tsx` → `desktop/src/renderer/src/knowledge-desk/KnowledgeDeskApp.tsx` |
| 知识闭环 API | 已实现 | `backend/src/main/java/com/agent/mvp/`（`/api/v1/knowledge-items`、`/tags`、`/model-sources`、`/ingestion-jobs`、`/knowledge-reviews`、`/dashboard`、`/settings`） |
| 内置运行时 | 已实现，随包 | `desktop/backend-jre/backend.jar`、`desktop/backend-jre/jre` |
| 本地数据 | 已实现 | H2（桌面 profile `application-desktop.yml`），无需外部数据库 |

桌面渲染层只有唯一入口 `App.tsx`，它直接挂载 `KnowledgeDeskApp`；仓库中不存在第二个主导航/聊天主界面。

## 3. 可选模块清单与边界

以下模块**不属于主产品默认交付范围**。它们可以存在、可以演进，但不得被描述为 Knowledge Desk 已交付的默认能力。

### 3.1 `ts-cli`

- **状态**：已实现
- **默认随桌面包发布**：是（作为 `backend-jre/ts-cli` 资源随包，但不是桌面主界面）
- **入口**：`ts-cli/src/index.tsx`
- **风险**：面向开发者/终端场景，依赖后端 API 与 legacy opt-in 端点（`tool-stats`、`release-report`）；与知识闭环无交集。README 中涉及 CLI 的能力声明不得外推为桌面版主功能。

### 3.2 Java Dev Coach

- **状态**：已实现（后端 supporting 模块，无桌面 UI 入口）
- **默认随桌面包发布**：是（编译进 `backend.jar`），但桌面端没有产品化入口
- **入口**：`backend/src/main/java/com/agent/mvp/coach/CoachController.java`（`/api/v1/coach/*`）
- **风险**：接口可被调用但无 UI，容易被误读为已交付的主功能。README 已声明它是 supporting module，仍需在对外材料中保持一致。

### 3.3 `python-service`（文档解析服务）

- **状态**：已实现（服务端栈组件）
- **默认随桌面包发布**：**否**（不在 `desktop/electron-builder.yml` 的 `extraResources`，也不在 `desktop/backend-jre/` 中；仅存在于 Compose 服务 `python-service`）
- **入口**：`python-service/main.py`；服务定义见 `docker-compose.yml`（`python-service` 段）
- **风险**：桌面版只能走本地/降级解析路径；把 `python-service` 写成桌面版必备组件属于事实错误。

### 3.4 `docker-compose` / `k8s` 服务端栈

- **状态**：已实现（可选部署路径）
- **默认随桌面包发布**：否
- **入口**：`docker-compose.yml`、`k8s/`、`scripts/deploy.sh`、`scripts/rollback.sh`
- **风险**：依赖 PostgreSQL/Redis/Kafka/Milvus 等外部基础设施，与 local-first 桌面体验不是同一交付面。服务端门禁（`release-check.sh prod`）不能替代 macOS 安装包发布门禁。

### 3.5 Codex 对齐的编码 Agent 能力（Thread / Worktree / PTY / Skills / Computer Use）

- **状态**：主进程代码已实现，渲染层无 UI（source-checkout-only）
- **默认随桌面包发布**：代码随包，但产品面默认关闭；打包 beta 明确排除 legacy devtools（含 Computer Use），即使运行时提供 `AI_AGENT_ENABLE_LEGACY_DEVTOOLS=1` 也不启用
- **入口**：`desktop/src/main/` 下的 `thread-manager.ts`、`worktree-manager.ts`、`pty-manager.ts`、`pty-pool.ts`、`skill-manager.ts`、`computer-use-manager.ts`、`approval-engine.ts`、`git-manager.ts`、`diff-parse.ts`、`tool-execution-bridge.ts`、`command-policy.ts`、`cli-manager.ts`
- **风险**：审批链路、窗口白名单、截图隐私控制尚未 production-ready。`docs/arch/001~003` 描述的是这条演进线，**不代表主产品默认交付范围**。任何把它写成主产品的表述都必须改正。

### 3.6 `local-service`（工作区文件/上下文本地服务）

- **状态**：已实现
- **默认随桌面包发布**：是（`desktop/backend-jre/local-service`）
- **入口**：`local-service/src/index.ts`（默认端口 8765，随机 Bearer token，仅本机回环）
- **风险**：它服务于编码 Agent / CLI 的工作区上下文采集，不属于 Knowledge Desk 知识闭环。随包 ≠ 主产品能力。

### 3.7 legacy `agent-*` 微服务

- **状态**：已归档（不在根 reactor，不参与 CI 门禁，不随发布产物交付）
- **默认随桌面包发布**：否
- **入口**：`legacy/pom.xml`（独立聚合器：`agent-common`、`agent-gateway`、`agent-router`、`agent-retrieval`、`agent-generation`、`agent-reflection`）；构建命令 `mvn -f legacy/pom.xml -DskipTests package`。根 `pom.xml` 已删除 `legacy` profile，根 reactor 仅保留 `backend`、`bug-sentinel-starter`；归档说明与复活规则见 `legacy/README.md`。**路径权威来源**：根 `pom.xml` 的注释块（若归档目录再次移动，以它为准，本节同步更新）。注意：Spring profile `legacy`（`SPRING_PROFILES_ACTIVE=legacy`，backend 的 tool-stats / release-report 等开发者工具）与本归档目录**不是一回事**，见 `legacy/README.md` §7
- **风险**：依赖未部署的 Kafka/Milvus 基础设施，仅能通过 `mvn -f legacy/pom.xml` 独立构建。不得在主线文档中作为默认能力描述。

## 4. 文档冲突处置规则

1. **本文档是产品主线口径的单一事实来源**。任何关于"什么属于主产品、什么属于可选模块"的争议，以本文档为准。
2. **README 与 `docs/arch/*` 冲突时，以本文档为准**。README 只保留主线摘要与指向本文档的链接。
3. `docs/arch/001`、`002`、`003` 描述的是**可选模块**演进线，不构成主产品交付承诺；它们的状态行已显式标注。
4. `docs/arch/004-knowledge-desk-api-contract.md` 属于**主线**文档，与本文档同级；若 004 与本文档冲突，先修 004，最终仍以本文档口径为准。`docs/arch/006-knowledge-desk-spec-alignment.md` 记录 DESIGN_SPEC / 004 / 实现三方差异，只记录不改契约。
5. **交付声明规则**：任何"已交付/已实现"的表述必须能指向默认构建路径中的入口文件，或一条可复现的验证命令；否则只能标注为"规划"或"可选模块"。
6. **升级路径**：可选模块若确需提升为默认交付，必须先在本文件更新其状态与风险，再同步 README 与其他材料；不得先在别处改口径。

## 5. 已知行为缺口（Beta 口径 vs 实际行为）

> 本节**只记录事实**，不在本轮修复；每一项都需要单独任务评估（涉及实现或文案变更）。

| # | 缺口 | 证据 | 对口径的影响 | 建议 |
| --- | --- | --- | --- | --- |
| G1 | **本机助手的 system prompt 与检索文案仍按"coding agent / 日志诊断"表述**：`AgentContextService.buildMessages` 的 system prompt 是 "You are a Java AI coding assistant. Use provided tool context as factual repo grounding…"；注入上下文前的标题是 "Here are some relevant historical log diagnoses for reference:"；而实际注入的是知识工作台导入的资料（`KnowledgeItemService` 整理后写入同一个 embedding store）。 | e2e-engineer 实测（t6）；代码：`backend/.../AgentContextService.java`、`RAGMemoryService.searchSimilarDiagnoses` | 助手是主界面之一（`knowledgeDeskAssistant.tsx`），但对外措辞把它描述成 coding assistant / 日志诊断，与"Knowledge Desk 是知识工作台"不一致 | 单独任务：改 system prompt 与上下文标题；评估 `searchSimilarDiagnoses` 重命名的调用面（含测试与 e2e） |
| G2 | **助手复用的是 legacy `/api/v1/agent/chat/stream` 通道**：Electron 主进程 `local-chat:send` → `streamLocalChat` → `POST /api/v1/agent/chat/stream`（`toolsEnabled: false`），004 契约未描述该链路。 | `desktop/src/main/ipc-registry.ts`；`docs/arch/006-knowledge-desk-spec-alignment.md` D5 | 助手链路缺少契约说明，联调/回归时无参照 | 单独任务：把助手链路写入 004 或新增助手契约文档 |

## 6. 变更记录

- 2026-09-08 创建：收敛产品主线，明确主产品定位、可选模块边界与文档冲突处置规则。
- 2026-09-08 更新：§3.7 对齐 WS2 归档结果（根 `pom.xml` 已删除 legacy profile，改为独立聚合器；最终路径 `legacy/`）；新增附录 A 声明-实现一致性核对表。
- 2026-09-08 更新：新增 §5「已知行为缺口」（G1 助手 prompt/检索文案、G2 助手复用 legacy 通道），记录 e2e-engineer 实测；§4 增补 006 引用。
- 2026-09-08 更新：归档目录路径二次校准（曾短暂改到 `archive/` 子目录，已全部回退），最终裁定为 `legacy/`，以根 `pom.xml` 注释为准；同步 §3.7、附录 A11、`docs/arch/006`、`docs/archive/task-java-dev-coach-mvp.md` 中的引用。

---

## 附录 A：声明-实现一致性核对表

**快照时间**：2026-09-08 15:42（CST）｜**基线**：branch `main`，HEAD `590f7d9`（工作树含 WS2/WS3/WS4 并发改动）
**复验方式**：`ssh_exec(alias="localhost", command="export PATH=\"/opt/homebrew/bin:/Users/liuyongze/java/jdk-21.0.10.jdk/Contents/Home/bin:$PATH\"; export JAVA_HOME=/Users/liuyongze/java/jdk-21.0.10.jdk/Contents/Home; cd /Users/liuyongze/Documents/AI-agent && <命令>")`
**状态含义**：✅ 已验证（本次实跑）｜⚠️ 部分验证（有前提/时效性）｜TODO 未执行（附原因）

| # | 声明 | 出处 | 验证命令（仓库根目录） | 实测结果 | 状态 |
| --- | --- | --- | --- | --- | --- |
| A1 | 主产品渲染层唯一入口是 `App.tsx` → `KnowledgeDeskApp.tsx`，不存在第二个主导航/聊天主界面 | 本文 §2；README「产品主线与模块边界」 | `grep -n KnowledgeDeskApp desktop/src/renderer/src/main.tsx desktop/src/renderer/src/App.tsx` + `ls desktop/src/renderer/src/*.tsx` | `main.tsx:8 <App />`；`App.tsx:2 import KnowledgeDeskApp`、`App.tsx:124 <KnowledgeDeskApp />`；顶层仅 `App.tsx`、`main.tsx` | ✅ |
| A2 | 知识闭环 API 已实现：`/api/v1/knowledge-items`、`/tags`、`/dashboard/summary`、`/settings`、`/model-sources`、`/ingestion-jobs`、`/knowledge-reviews` | 本文 §2 | `grep -rn "@RequestMapping(\"/api/v1" backend/src/main/java --include=*.java` + 各控制器路由 grep | `KnowledgeItemController`（`/api/v1`：`/knowledge-items`、`/knowledge-items/search`、`/tags`、`/dashboard/summary`）、`KnowledgeReviewController`（`/api/v1`）、`ModelSourceController`（`/api/v1/model-sources`）、`IngestionJobController`（`/api/v1/ingestion-jobs`）、`SettingsController`（`/api/v1/settings`） | ✅ |
| A3 | KD 渲染层只使用 `electronAPI.knowledge.*` 与 `localChat` 桥接后端，不调用编码 Agent IPC | 本文 §3.5 | `grep -rn electronAPI desktop/src/renderer/src/knowledge-desk` + 查看 `knowledgeDeskApi.ts` 类型定义 | 仅 1 处命中（`knowledgeDeskApi.ts:502 getElectronApi`），类型仅声明 `knowledge`、`localChat`；无 `workspace`/`git`/`chat`/`cli`/`terminal` 调用 | ✅ |
| A4 | 桌面包内置后端运行时（`backend.jar` + `jre`） | 本文 §2；README Beta scope | `ls -la desktop/backend-jre` + `grep -A6 extraResources desktop/electron-builder.yml` | `backend.jar`（229,306,231 B）、`jre/`、`local-service/`、`ts-cli/`；`extraResources: from: backend-jre` | ✅ |
| A5 | 桌面版使用内置 H2，正常使用无需外部数据库 | 本文 §2；README Beta scope | `grep -nE h2 backend/src/main/resources/application-desktop.yml`；`grep -nE ddl-auto backend/src/main/resources/application-desktop.yml` | `jdbc:h2:file:${user.home}/.ai-agent-desktop/db;AUTO_SERVER=TRUE`、`driver-class-name: org.h2.Driver`、`ddl-auto: validate`、`locations: classpath:db/h2` | ✅（注：`validate` + `classpath:db/h2` 是 WS4 统一 Flyway 迁移进行中的状态） |
| A6 | `ts-cli`、`local-service` 随桌面包发布，但不属于主界面 | 本文 §3.1、§3.6 | `ls desktop/backend-jre` | 含 `ts-cli/`、`local-service/` 子目录 | ✅ |
| A7 | `python-service` **不**随桌面包发布，仅存在于 Compose 服务端栈 | 本文 §3.3 | `grep -n python desktop/electron-builder.yml`（期望无输出）+ `ls desktop/backend-jre` | electron-builder.yml 无 python；`backend-jre/` 无 python；服务定义仅在 `docker-compose.yml` | ✅ |
| A8 | Java Dev Coach 后端已实现但桌面无 UI 入口 | 本文 §3.2 | `grep -rni coach desktop/src/renderer/src --include=*.ts --include=*.tsx` | 0 命中（后端 `com.agent.mvp.coach.CoachController` 存在） | ✅ |
| A9 | Codex 对齐编码 Agent 能力：主进程已实现、渲染层无 UI | 本文 §3.5 | `ls desktop/src/main/*.ts`；`grep -rni -e thread-manager -e worktree -e ptyManager -e skill-manager -e computerUse desktop/src/renderer/src` | 主进程 22 个模块（含 `thread-manager`、`worktree-manager`、`pty-manager`、`pty-pool`、`skill-manager`、`computer-use-manager`、`approval-engine`、`git-manager`、`diff-parse`、`tool-execution-bridge`）；渲染层 0 命中 | ✅ |
| A10 | 打包 beta 明确排除 Computer Use，即使 `AI_AGENT_ENABLE_LEGACY_DEVTOOLS=1` 也不启用 | 本文 §3.5；README L123 | `grep -n -e isPackaged -e ENABLE_LEGACY_DEVTOOLS desktop/src/main/index.ts` | `index.ts:160 const isLegacyEnabled = !app.isPackaged && process.env.AI_AGENT_ENABLE_LEGACY_DEVTOOLS === '1';` | ✅ |
| A11 | legacy `agent-*` 不在根 reactor、不参与 CI 与发布产物 | 本文 §3.7 | `sed -n '15,30p' pom.xml`；`ls legacy/`；`grep -n "<module>" legacy/pom.xml` | 根 `<modules>` 仅 `backend`、`bug-sentinel-starter`，无 `legacy` profile；`legacy/pom.xml` 聚合 6 个模块；根目录已无 `agent-*` 目录 | ✅（2026-09-08 15:47 快照，最终路径 `legacy/`） |
| A12 | 发布组件版本一致（`0.1.0-beta.4`，2026-09-08 由 beta.3 收口） | README「macOS Beta candidate workflow」 | `./scripts/check-release-version.sh` | `[release-version] all release components use 0.1.0-beta.4`；bundle 元数据 `0.1.0` / `bundleVersion 4`；exit 0 | ✅（`desktop/src/renderer/package.json` 的 `0.0.0` 是内部 workspace 包，不在发布组件清单） |
| A13 | beta.3 历史问题中的两个搜索测试已修复，HEAD 上全绿 | README L119 | `mvn -pl backend -Dtest=SearchOrchestratorTest,SearchStrategyConfigTest -DfailIfNoTests=false test` | `SearchOrchestratorTest` 3/3 通过；`SearchStrategyConfigTest` 3/3 通过；`Tests run: 6, Failures: 0, Errors: 0`；`BUILD SUCCESS`；mvn exit 0 | ✅ |
| A14 | Knowledge Desk 渲染层核心链路（导入/列表/搜索/复习/备份/降级/视图模型）可用 | 本文 §2 | `cd desktop/src/renderer && npm test`（vitest） | 12 个测试文件、35 个测试全部通过，exit 0 | ✅ |
| A15 | API 与 readiness 路径一致性 | README | `./scripts/check-consistency.sh` | `[consistency] API and readiness path checks passed`；exit 0 | ✅ |
| A16 | 打包产物布局：`app.asar` 含 renderer 与 main、JRE `java` 可执行、renderer 引用相对 Vite 资源 | README 打包门禁 | `node desktop/scripts/verify-packaged-app.cjs`（内部执行 `electron-builder --dir --mac`） | 未执行 | **TODO**：需要完整 electron-builder `--dir` 打包（数分钟 + 临时产物），属发布验证范围，建议由 release-verifier 在 WS6 全量验证中执行 |
| A17 | macOS 安装包 ad-hoc 签名、未公证边界声明 | README「macOS Beta candidate workflow」 | 需实际构建 DMG/ZIP 后执行 `codesign -dv` / `spctl -a -vv` / Gatekeeper 校验 | 未执行 | **TODO**：依赖真实打包与签名环境，属 WS6 发布验证范围 |

### 附录 A 使用说明

1. 本表是「文档声明 → 可复现验证」的对照。**新增任何"已交付"声明时，必须在本表补一行**，否则按 §4 第 5 条视为未交付。
2. 表中 TODO 项不得被引用为已完成的发布结论；补齐前，README 中对应的打包/签名表述只能作为流程说明存在。
3. 仓库正被多个任务并发修改（WS2 仓库治理、WS3 依赖治理、WS4 数据层迁移、WS5 e2e、WS6 发布验证）。**复验时请重跑命令并更新时间戳**，不要直接引用本表结论。
