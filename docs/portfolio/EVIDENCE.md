# Knowledge Desk 交付证据与复现清单

> 本页用于支撑简历和面试中的可量化表述。发布资产、历史多运行时验证和当前开发基线是三类不同证据，不能互相替代。
>
> **使用规则：**`v0.1.0-beta.2` 只证明该 tag 对应的发布物；测试与覆盖率必须同时给出执行日期、命令和源代码边界。2026-08-27 的当前质量数据对应已推送的 `main@344b740`，它没有新的 tag、安装包或 GitHub Release，尚不是 Beta.2 或任何新发布版本的证明。

## 1. 版本与发布

- Git 分支：`main`
- Beta tag：`v0.1.0-beta.2`
- Tag/发布提交：`fd5f26d31f961fcf0e2b79022ff9e5438c6f20b1`
- GitHub Release：<https://github.com/lqq151510/Ai-Agent/releases/tag/v0.1.0-beta.2>
- Release 类型：prerelease
- 平台：macOS arm64
- 签名边界：ad-hoc signed，未声明 Developer ID 或 notarization

在线资产：

- `AI.Agent-0.1.0-beta.2-mac-arm64.dmg`
- `AI.Agent-0.1.0-beta.2-mac-arm64.zip`
- `release-manifest.json`
- `SHA256SUMS`

## 2. 验证记录（按证据边界分层）

### 2.1 当前主线候选基线（2026-08-27，非发布证据）

源代码边界：已推送的 `main@344b7402af76f20d1898cd4c68cd8ba3e14045fc`。该记录可用于说明当前主线质量；它没有 `v0.1.0-beta.3` tag、安装包或 Release，不能写成已发布 Beta 的测试结果。

命令：

```bash
mvn --settings .mvn/settings.xml -pl backend -am clean verify
```

结果：

- `backend`：344 tests run，0 failures，0 errors，9 skipped。
- `bug-sentinel-starter`（`-am` 构建前置模块）：4 tests run，0 failures，0 errors。
- JaCoCo bundle 行、分支双门禁均通过；精确覆盖率见第 3 节。
- Maven reactor build success。

### 2.2 历史多运行时验证（2026-08-20，非版本发布证明）

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

## 3. 当前主线后端质量门禁与覆盖率（2026-08-27）

JaCoCo 在 Maven `verify` 阶段对 `backend` bundle 执行以下门禁：

- Lines covered ratio：至少 65%
- Branches covered ratio：至少 60%

在 `main@344b740` 执行的 `clean verify` 生成的 `backend/target/site/jacoco/jacoco.xml` 汇总：

- Lines：5543 covered / 7256 total，76.39%
- Branches：1649 covered / 2623 total，62.87%
- Methods：1033 covered / 1284 total，80.45%
- Classes：259 covered / 285 total，90.88%

覆盖率只描述此次主线 `backend` JaCoCo 统计，不外推为 Electron、Renderer 或整仓覆盖率；也不表示 Beta.2 或后续 Beta 安装包已经以这些数字复验。

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
gh release view v0.1.0-beta.2 \
  --json tagName,name,isPrerelease,isDraft,publishedAt,url,assets,targetCommitish
```

确认 tag 指向：

```bash
git rev-parse v0.1.0-beta.2^{commit}
```

下载校验清单：

```bash
gh release download v0.1.0-beta.2 \
  --pattern SHA256SUMS \
  --pattern release-manifest.json \
  --dir /tmp/knowledge-desk-beta2-evidence
```

不要在已有目录里无条件覆盖同名文件；复核时使用新建临时目录。

## 6. 对外表述规则

- 数字必须带范围、日期和来源边界，例如“2026-08-27 `main@344b740` 的 backend 344 个测试”，不说“项目共有 344 个测试”。
- 不把未打 tag 的主线候选测试或覆盖率归因给 Beta.2、Release 或已发布安装包；创建候选 tag 后仍要在该提交上复跑。
- 历史 225 个测试是 2026-08-20 的验证快照，不能与当前 344 个后端测试相加，也不能默认归因给 Beta.2。
- 发布必须带版本和平台，例如“macOS arm64 Beta.2”。
- 签名必须带边界，例如“ad-hoc signed personal Beta”。
- “独立启动”指不要求另装 Java/PostgreSQL/Docker，不代表 AI 功能不需要本机模型。
- 任何性能百分比都要有脚本、数据集、环境和原始结果，否则不写入简历。
