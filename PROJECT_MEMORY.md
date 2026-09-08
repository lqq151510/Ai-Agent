# Project Memory

## AI + Java Dev Coach MVP

- Scenario: Turn the existing Java AI Agent MVP into a development cockpit for Java + AI learners, covering requirement breakdown, scaffold generation, and log diagnosis.
- Minimal architecture: Add backend `coach` module with `Controller -> Service -> Prompt/Template/Zip infra` boundaries, persist `dev_coach_runs`, and expose a Web `CoachWorkspace`.
- Verification commands: `mvn -q test`, `mvn -q -DskipTests compile`, `cd web && npm run build`; scaffold ZIPs should unzip and pass `mvn -q -DskipTests package`.
- Next extensions: add learning drills, richer template catalog, CLI commands, and long-term engineering-memory search only after the MVP endpoints are stable.
- Phase 2 (Completed): Integrated "Memory Capsule" (Memory UI) allowing users to retrieve, edit (with vector re-embedding), and delete RAG data from pgvector/PostgreSQL. Added adaptive typewriter streaming output and glassmorphic glowing skeleton states.

## 2026-09-08 决策：产品主线定位与可选模块边界

- **主产品定位**：AI Agent Knowledge Desk —— local-first 个人知识工作台，macOS Electron 桌面应用 + 随包内置 Spring Boot 后端、H2 数据库与 JRE。核心闭环：收集 → Inbox 整理 → AI 元数据增强 → Library 浏览/搜索 → Detail 回看（保留来源上下文）。渲染层唯一入口 `desktop/src/renderer/src/App.tsx` → `knowledge-desk/KnowledgeDeskApp.tsx`。
- **可选模块边界**（不属于主产品默认交付范围）：`ts-cli`、Java Dev Coach、`python-service`、`docker-compose`/`k8s` 服务端栈、Codex 对齐的编码 Agent 能力（Thread/Worktree/PTY/Skills/Computer Use）、`local-service`、legacy `agent-*` 微服务。各模块状态、是否随桌面包发布、入口文件与风险见 `docs/arch/000-product-line.md`。
- **单一事实来源**：`docs/arch/000-product-line.md`。README 与 `docs/arch/*` 口径冲突时以该文件为准；`docs/arch/001~003` 已标注为可选模块演进线，`docs/arch/004` 属主线 API 契约。
- **冲突处置规则**：新增"已交付/已实现"声明必须指向默认构建路径中的入口文件或一条可复现的验证命令，否则只能标注为"规划/可选模块"；可选模块若需升级为默认交付，必须先更新 `000-product-line.md` 的状态与风险，再同步 README 及其他材料。
- **桌面版数据库迁移（同日核实，替代 2026-05 旧计划）**：`backend/src/main/resources/application-desktop.yml` 已启用 Flyway（`spring.flyway.enabled: true` + `locations: classpath:db/h2` + `baseline-on-migrate: true`），`spring.jpa.hibernate.ddl-auto: validate` 已生效；**不存在 `ddl-auto: update`，也不再需要 H2 专用 init 脚本**。桌面 H2 线（`db/h2`）与服务端 PostgreSQL 线（`db/migration`）是两条独立血统，版本号相同但语义不一一对应。
- **待办：双 Flyway 血统统一**：统一方案与升级路径见 `docs/arch/005-database-migration-strategy.md`。本轮落地方案 B（CI 拦截 + 校验和基线 + 桌面配置回归守卫）；方案 A（血统合并）需配套 repair/升级桥，否则存量桌面库的 `flyway_schema_history` 会 checksum mismatch 导致启动失败。
- **旧计划作废**：`.trae/documents/desktop-client-plan.md`（2026-05）中的"JPA ddl-auto 改为 `update`（桌面版不用 Flyway）""禁用 Flyway""编写 H2 专用初始化脚本，JPA ddl-auto=update"均已作废，不得再被引用。（该表述从未出现在本文件中：`git log --all -p -- PROJECT_MEMORY.md` 全历史 0 命中，此前误引已修正。）
