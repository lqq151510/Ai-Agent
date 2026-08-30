# Knowledge Desk 交付证据与复现清单

> 本页用于支撑简历和面试中的可量化表述。发布资产、历史多运行时验证和当前开发基线是三类不同证据，不能互相替代。
>
> **使用规则：**`v0.1.0-beta.3` 只证明该 tag 对应的 macOS arm64 发布资产；测试与覆盖率必须同时给出执行日期、命令和源代码边界。Beta.3 tag 指向 `66a1a67`，但该提交的主 CI 未通过：release preflight 发现组件版本不一致，backend-quality 为 344 tests、2 failures、0 errors、9 skipped。因此，发布资产、历史质量快照和当前 CI 状态必须分层引用。

## 1. 版本与发布

- Git 分支：`main`
- 当前 Beta tag：`v0.1.0-beta.3`
- Tag/发布提交：`66a1a67bcdeb6f41aa94c7c14c33ea14dbb17f40`
- GitHub Release：<https://github.com/lqq151510/Ai-Agent/releases/tag/v0.1.0-beta.3>
- Release 类型：prerelease
- 平台：macOS arm64
- 签名边界：Release 说明声明为 ad-hoc signed，未使用 Developer ID，未公证

在线资产：

- `AI.Agent-0.1.0-beta.3-mac-arm64.dmg`
- `AI.Agent-0.1.0-beta.3-mac-arm64.zip`
- `SHA256SUMS`

Release 页面公开列出了 DMG 与 ZIP 的 SHA-256；本页更新时未重新下载资产并复算校验和，因此这里只证明 Release 已发布及其公开声明，不把它写成此次审计已完成的下载回验。

## 2. 验证记录（按证据边界分层）

### 2.1 Beta.3 CI 与发布工作流状态（2026-08-29）

- `CI/CD Pipeline #47`：failure，提交为 `66a1a67`。
- `release-preflight`：failure，Desktop 为 Beta.3，而 ts-cli、local-service、根 Maven、backend 和 bug-sentinel-starter 仍为 Beta.2。
- `backend-quality`：failure，344 tests、2 failures、0 errors、9 skipped；失败项为 `CodeToolServiceTest.shouldReturnSearchMatches` 和 `CodeToolServiceTest.shouldReturnExplicitMessageWhenSearchHasNoMatches`。
- 已通过任务：`desktop-test`、`python-service-test`、`deployment-config`、`sentinel-alert`。
- `macOS Release Candidate #3`：workflow success，但 `Build signed macOS arm64 candidate` 为 skipped。

当前 Beta.3 Release 的存在不等于主 CI 通过，也不等于工作流已构建、签名或公证该 Release 的资产。

### 2.2 当前 P0 提交与 CI 验证（2026-08-30，`main@9686f46`，非发布资产证据）

源代码边界：已推送的 `main@9686f4683f9b404902ff185ac29db2aa5fcc42a2`，包括全部发布组件的 Beta.3 版本对齐和 `CodeToolService` 的 `rg` 启动失败 Java 回退。CI/CD Pipeline #33293965797 绑定该提交并全绿；这仍不能用作 Beta.3 既有 tag、Release 资产或 GUI 验收的质量表述。

命令：

```bash
/bin/bash ./scripts/check-consistency.sh
./scripts/check-release-version.sh
mvn --settings .mvn/settings.xml -pl backend \
  com.diffplug.spotless:spotless-maven-plugin:2.43.0:check
mvn --settings .mvn/settings.xml -pl backend -am clean verify
git diff --check
```

结果：所有命令通过。发布版本门禁确认 Desktop、CLI、local-service、根 Maven、backend 与 bug-sentinel-starter 均为 `0.1.0-beta.3`。Maven reactor 中 `bug-sentinel-starter` 4 tests、0 failures、0 errors；`backend` 345 tests、0 failures、0 errors、9 skipped。JaCoCo bundle 门禁通过，行 5598/7317（76.51%），分支 1667/2653（62.83%）。新增的 `CodeToolServiceTest` 覆盖 `rg` 无法启动时的 Java 回退。CI/CD Pipeline #33293965797 的 release-preflight、backend-quality、desktop-test、python-service-test 和 deployment-config 均通过。

### 2.3 历史开发基线（2026-08-27，main@344b740，非 Beta.3 发布证据）

源代码边界：已推送的 `main@344b7402af76f20d1898cd4c68cd8ba3e14045fc`。这是 2026-08-27 的历史开发质量快照；它早于当前 Beta.3，不能代表 Beta.3 当前 CI 或发布质量。

命令：

```bash
mvn --settings .mvn/settings.xml -pl backend -am clean verify
```

结果：

- `backend`：344 tests run，0 failures，0 errors，9 skipped。
- `bug-sentinel-starter`（`-am` 构建前置模块）：4 tests run，0 failures，0 errors。
- JaCoCo bundle 行、分支双门禁均通过；精确覆盖率见第 3 节。
- Maven reactor build success。

### 2.4 历史候选 .app 启动 smoke（2026-08-27，非 Beta.3 发布验收）

候选 `.app` 由 `desktop` 的 `npm run test:packaged` 生成，使用 Electron 43.1.1、electron-builder 26.15.7 和 Node 22。包内布局测试通过，并确认 `app.asar`、`backend-jre/backend.jar` 与 bundled JRE 的 `java` 均存在且非空；此次生成的 app.asar 为 3,237,106 bytes，backend JAR 为 229,303,688 bytes。该目录是临时产物，不是 DMG/ZIP 发布资产。

随后在临时 `--user-data-dir` 下直接启动：

```bash
"AI Agent.app/Contents/MacOS/AI Agent" \
  --user-data-dir=/tmp/ai-agent-packaged-smoke.U6ztNS/user-data \
  --disable-gpu
curl --noproxy '*' \
  http://127.0.0.1:18080/api/v1/system/health/ready
```

结果：HTTP 200，`ready=true`；database 与内存 redis 检查为 `ok=true`，本机模型端点 `localhost:1234` 未运行并返回可选依赖 `ok=false`，但没有阻断 Desktop Profile readiness。启动日志还确认 Java 21.0.10、H2/Flyway 13 migrations、Tomcat 18080、PgVector disabled，以及 `engineering_memory` 的 persistent desktop vector index 均正常。

边界：本次是隔离 shell smoke，验证了 `.app` 进程、内置后端和 loopback readiness；没有验证 Apple 签名/Gatekeeper、DMG/ZIP 下载回验或人工窗口交互。因此不把它写成 Beta.3 发布验收。

### 2.3 历史多运行时验证（2026-08-20，非版本发布证明）

以下记录保留为当时的跨运行时验证快照。它们没有绑定不可变提交，不应与 `v0.1.0-beta.2` tag 或本页 2026-08-27 的 `main@344b740` 基线混用；对外使用前应在目标提交复跑。

#### 后端 Maven reactor

命令：

```bash
mvn --settings .mvn/settings.xml test
```

结果：

- 225 tests run
- 0 failures
- 0 errors
- 9 skipped
- Reactor build success

#### Electron Main Process

命令：

```bash
cd desktop
npm run test:main
```

结果：25 passed，0 failed。

主要覆盖：命令解析、工作区边界、审批防重放、本地文件导入、来源监视、打包能力门禁、内置 JRE 模块和后端附着。

#### Desktop production build

命令：

```bash
cd desktop
npm run build
```

结果：TypeScript Main 与 React/Vite Renderer 构建成功。

说明：本轮本机 Node 为 26.3.0；这是开发诊断验证，不替代 `.nvmrc` 指定的 Node 22 正式发布基线。

#### Local Service

命令：

```bash
cd local-service
npm run build
npm test
```

结果：10 passed，0 failed。

主要覆盖：相对路径读取、绝对路径/穿越/前缀碰撞拒绝、内外部符号链接、token 鉴权、禁用 exec、固定工作区和树深度限制。

#### Java 扩展模块

将 `agent-common`、`agent-router`、`agent-retrieval`、`agent-generation`、`agent-reflection`、`agent-gateway` 的编译目标统一为 Java 21 后，先安装根 parent POM 与 `agent-common` 到本地 Maven 仓库，再逐模块执行 `mvn -DskipTests package`，6 个模块均构建成功。

这些模块不是桌面 Beta 的必经运行时，因此该结果只证明 Java 21 编译兼容，不扩大为桌面端到端验证。

#### React Renderer

命令：

```bash
cd desktop/src/renderer
npm run lint
npm test
npm run build
```

结果：11 test files、33 tests passed，ESLint 与 TypeScript/Vite build 通过。

本轮同时将 `vitest 4.1.11` 和兼容 Node 22 基线的 `jsdom 26.1.0` 固定到开发依赖与 lockfile，测试不再通过 `npx` 临时下载工具。

## 3. 后端质量门禁与覆盖率

JaCoCo 在 Maven `verify` 阶段对 `backend` bundle 执行以下门禁：

- Lines covered ratio：至少 65%
- Branches covered ratio：至少 60%

### 3.1 当前 P0 提交（2026-08-30，`main@9686f46`）

`main@9686f46` 执行 `clean verify` 后，`backend/target/site/jacoco/jacoco.xml` 汇总为：

- Lines：5598 covered / 7317 total，76.51%
- Branches：1667 covered / 2653 total，62.83%

这些数字描述该提交的后端验证，且其 CI backend-quality 已通过；它们仍不证明 Beta.3 tag 或已发布安装包。

### 3.2 历史开发基线（2026-08-27，main@344b740）

在 `main@344b740` 执行的 `clean verify` 生成的 `backend/target/site/jacoco/jacoco.xml` 汇总：

- Lines：5543 covered / 7256 total，76.39%
- Branches：1649 covered / 2623 total，62.87%
- Methods：1033 covered / 1284 total，80.45%
- Classes：259 covered / 285 total，90.88%

覆盖率只描述各自日期和源代码边界内的 backend JaCoCo 统计，不外推为 Electron、Renderer、整仓、Beta.2 或 Beta.3 安装包质量。Beta.3 #47 的历史失败与当前未提交工作树验证必须分别陈述。

## 4. 架构证据定位

- 桌面入口与后端生命周期：`desktop/src/main/index.ts`、`desktop/src/main/backend-manager.ts`
- 文件导入可信边界：`desktop/src/main/knowledge-source-manager.ts`
- IPC 注册：`desktop/src/main/ipc-registry.ts`
- Renderer 主应用：`desktop/src/renderer/src/knowledge-desk/KnowledgeDeskApp.tsx`
- Renderer API 契约：`desktop/src/renderer/src/knowledge-desk/knowledgeDeskApi.ts`
- 知识 API：`backend/src/main/java/com/agent/mvp/knowledge/KnowledgeItemController.java`
- 复习 API/调度：`KnowledgeReviewController.java`、`KnowledgeReviewService.java`、`KnowledgeReviewScheduler.java`
- 多用户 RAG：`RAGMemoryService.java`、`SemanticCacheService.java`
- Desktop Profile：`backend/src/main/resources/application-desktop.yml`
- 本地向量持久化与恢复：`PersistentInMemoryEmbeddingStore.java`、`EmbeddingStoreProvider.java`
- 桌面构建：`desktop/scripts/build-all.sh`
- 发布门禁：`scripts/release-check.sh`、`scripts/release-check-macos.sh`

## 5. 发布证据复核命令

查看 release：

```bash
gh release view v0.1.0-beta.3 \
  --json tagName,name,isPrerelease,isDraft,publishedAt,url,assets,targetCommitish
```

确认 tag 指向：

```bash
git rev-parse v0.1.0-beta.3^{commit}
```

下载校验清单：

```bash
gh release download v0.1.0-beta.3 \
  --pattern 'AI.Agent-0.1.0-beta.3-mac-arm64.dmg' \
  --pattern 'AI.Agent-0.1.0-beta.3-mac-arm64.zip' \
  --pattern SHA256SUMS \
  --dir /tmp/knowledge-desk-beta3-evidence
```

不要在已有目录里无条件覆盖同名文件；复核时使用新建临时目录。

## 6. 对外表述规则

- 数字必须带范围、日期和来源边界，例如“2026-08-27 `main@344b740` 的 backend 344 个测试”，不说“项目共有 344 个测试”。
- 不把历史 `main@344b740` 测试或覆盖率归因给 Beta.3、Release 或已发布安装包；创建新候选后仍要在该提交上复跑。
- 历史 225 个测试是 2026-08-20 的验证快照，不能与 2026-08-27 的 344 个后端测试相加，也不能默认归因给 Beta.3。
- 发布必须带版本和平台，例如“macOS arm64 Beta.3”。当前不能说“Beta.3 发布物全量后端测试通过”；可精确表述为“2026-08-30 `main@9686f46` 的 backend 345 个测试通过，且该提交主 CI 全绿”。
- 签名必须带边界，例如“ad-hoc signed personal Beta”。
- “独立启动”指不要求另装 Java/PostgreSQL/Docker，不代表所有 AI 能力都不需要模型配置、网络或外部服务。AI 整理可使用用户配置的 DeepSeek、OpenAI 或 OpenAI-compatible 端点；未配置或不可连接时，普通知识管理走本地降级能力。
- 任何性能百分比都要有脚本、数据集、环境和原始结果，否则不写入简历。

## 附录 A：v0.1.0-beta.2 历史发布证据

Beta.2 是早于当前 Beta.3 的历史 macOS arm64 prerelease：tag/提交为 `v0.1.0-beta.2` / `fd5f26d31f961fcf0e2b79022ff9e5438c6f20b1`，发布页为 <https://github.com/lqq151510/Ai-Agent/releases/tag/v0.1.0-beta.2>。其资产包括 DMG、ZIP、`release-manifest.json` 与 `SHA256SUMS`。这些信息只保留用于追溯历史发布物，不代表 Beta.3 的功能、测试、签名或发布质量。
