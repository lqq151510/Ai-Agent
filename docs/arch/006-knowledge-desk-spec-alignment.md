# Knowledge Desk 设计规范 ↔ API 契约 ↔ 实现 一致性差异清单

> 版本：v1.0 | 日期：2026-09-08 | 状态：只记录差异，未改契约
> 对照对象：`knowledge-desk/DESIGN_SPEC.md`（设计规范）、`docs/arch/004-knowledge-desk-api-contract.md`（API 契约）、`desktop/src/renderer/src/knowledge-desk/`（实际实现）
> 主线口径：`docs/arch/000-product-line.md`

---

## 1. 结论

三份文档描述的是同一个 Knowledge Desk，但**页面集合、设置信息架构、组件清单三处不一致**；此外 004 有一条已过期的构建限制，DESIGN_SPEC 使用了本机绝对路径。**本文只列差异与建议，不改动 004 契约本身**——契约变更需与后端/前端同时确认。

## 2. 三份文档的定位

| 文档 | 定位 | 时间基线 | 覆盖范围 |
| --- | --- | --- | --- |
| `knowledge-desk/DESIGN_SPEC.md` | 高保真前端设计规范（视觉 + 页面 + 交付物） | 无版本/日期头（内容早于 2026-08） | 6 个静态原型页 + 2 个 React 文件 |
| `docs/arch/004-knowledge-desk-api-contract.md` | 前后端联调用 API 契约 | v0.1 / 2026-06-25 / "后端骨架已落地" | 7 个页面的接口映射 + 12 组接口 |
| `desktop/src/renderer/src/knowledge-desk/` | 实际实现（唯一交付面） | 持续演进（含未提交 WIP） | 8 个导航页 + 助手链路 |

## 3. 差异清单

| # | 差异 | 证据 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| D1 | **页面集合不一致**：DESIGN_SPEC 只定义 6 页（Dashboard / Inbox / Library / Detail / Search / Settings），实际导航有 8 项：工作台、本机助手、收集箱、知识库、每日回顾、归档库、全局搜索（+ 设置入口） | `desktop/src/renderer/src/knowledge-desk/KnowledgeDeskApp.tsx` 的 `pages` 数组；`knowledge-desk/DESIGN_SPEC.md` 的 "Core Pages" 只有 6 条 | 新人按 DESIGN_SPEC 读代码会漏掉 3 个页面 | 在 DESIGN_SPEC 补 "本机助手 / 每日回顾 / 归档库" 三节，或标注该文件为"视觉基线，页面集合以实现为准" |
| D2 | **004 引用了不存在的页面**：§4.7 的映射对象 `knowledge-desk/pages/review.html` 不存在 | `ls knowledge-desk/pages/` 只有 dashboard/detail/inbox/library/search/settings 六个 html | 契约指向幽灵文件，联调时找不到参照 | 把 §4.7 的映射对象改为 React 实现 `knowledgeDeskReview.tsx`（或补一个 review.html 原型） |
| D3 | **设置信息架构不一致**：DESIGN_SPEC 说 Settings 含 "Profile, Models, AI Preferences, Privacy, Integrations"；004 §4.6 只映射 `settings/profile`、`settings/storage`、`model-sources/*`、`settings/export`、`settings/import` | `knowledge-desk/DESIGN_SPEC.md` Settings 段；`docs/arch/004` §4.6 | "AI Preferences / Privacy / Integrations" 没有对应端点，读者会以为已实现 | 在 004 §4.6 标注这三项目前是 UI 占位/规划；或在 DESIGN_SPEC 收敛为已实现的两组 |
| D4 | **组件清单过时**：DESIGN_SPEC 的 "React mapping" 只列 `KnowledgeDeskApp.tsx` 与 `knowledge-desk.css`，实际渲染层有 8 个 `.tsx` + 多个 `.ts`（含 `knowledgeDeskAssistant`、`knowledgeDeskReview`、`knowledgeDeskSettings`、`knowledgeDeskDisplay`、`knowledgeDeskShared`、`knowledgeDeskViewModel`、`knowledgeDeskApi`、`knowledgeDeskFileTypes`） | `ls desktop/src/renderer/src/knowledge-desk/` | 交付物清单与代码脱节 | 改为"入口 + 主要模块"列表，或直接指向目录 |
| D5 | **本机助手不在 004 契约内**：助手走 Electron 主进程 `local-chat` IPC → `POST /api/v1/agent/chat/stream`（`toolsEnabled: false`），而 004 只覆盖知识工作台资源接口（`knowledge-items` / `tags` / `settings` / `model-sources` / `ingestion-jobs` / `knowledge-reviews` / `dashboard`） | `desktop/src/main/ipc-registry.ts` 的 `local-chat:send` → `streamLocalChat` → `backendRequestRaw('/api/v1/agent/chat/stream')` | 助手是主界面之一，但契约缺该链路的请求/响应说明 | 在 004 增加"本机助手（agent/chat/stream）"一节，或明确 004 只覆盖资源类接口并指向助手文档 |
| D6 | **004 §11 有一条过期限制**："全仓库 Maven 全量编译目前被其他已有模块阻塞" | 根 `pom.xml` 现在只有 `backend` + `bug-sentinel-starter`（`agent-*` 已归档到 `legacy/`）；`PLAN.md` 记录 `9686f46` 全 reactor 通过（345 tests） | 读者会误判仓库当前不可编译 | 建议复验后删除或改写为"2026-06 的历史限制，已随 legacy 归档解除"（复验命令见 §5） |
| D7 | **DESIGN_SPEC 使用本机绝对路径**（原 8 处）：Delivery 段曾列出 `&lt;用户目录&gt;/Documents/AI-agent/knowledge-desk/pages/*.html` 等绝对路径 | `knowledge-desk/DESIGN_SPEC.md` Delivery 段 | 文档不可移植、换机器即失效 | **已修复（2026-09-08）**：改为仓库相对路径（`knowledge-desk/pages/dashboard.html` 等）；同时清理 001 的 Seatbelt 示例、004 的 `sourceUri` 示例、superpowers 设计文档的验收命令为 `<REPO>` / `<HOME>` 占位符（t9 审计 P1 A4） |
| D8 | **助手提示词/检索语义与产品定位不符**（e2e-engineer 实测）：`AgentContextService.buildMessages` 的 system prompt 仍是 "You are a Java AI coding assistant..."，检索结果标题是 "Here are some relevant historical log diagnoses for reference:"，而实际注入的是知识工作台导入的资料；`RAGMemoryService.searchSimilarDiagnoses` 命名名不副实 | e2e-engineer 报告（t6）；详见 `docs/arch/000-product-line.md`「已知行为缺口」 | 对外措辞把知识问答描述成"日志诊断"，且助手自称 coding assistant | 属**实现/文案缺口**，不在本轮文档修正范围；建议单独任务处理（改 prompt 与标题、重命名方法需评估调用面） |

## 4. 建议处置顺序

1. **只改文档、可立即做**：D2（幽灵页面）、D4（组件清单）、D7（绝对路径）、D6（复验后改限制说明）。
2. **需要设计确认**：D1（页面集合以谁为准）、D3（Settings 的三项是占位还是规划）。
3. **需要契约/实现变更**：D5（助手链路入契约）、D8（提示词与命名）——**不在本轮范围**。

## 5. 复验命令

```bash
# 页面集合（实现）
grep -n "id: '" desktop/src/renderer/src/knowledge-desk/KnowledgeDeskApp.tsx
# 静态原型页面
ls knowledge-desk/pages/
# 渲染层组件清单
ls desktop/src/renderer/src/knowledge-desk/
# 助手链路
grep -n "local-chat:send" desktop/src/main/ipc-registry.ts
grep -n "agent/chat/stream" desktop/src/main/ipc-registry.ts
# 根 reactor 模块（验证 D6）
sed -n '15,30p' pom.xml
```

## 6. 变更记录

- 2026-09-08 创建：核对 DESIGN_SPEC / 004 / 实现三方的 8 处差异，给出处置建议；未改动 004 契约。
- 2026-09-08 更新：D7 已修复——DESIGN_SPEC 8 处本机绝对路径改为仓库相对路径，001 Seatbelt 示例、004 `sourceUri` 示例、superpowers 设计文档验收命令改为 `<REPO>` / `<HOME>` 占位符（对应 t9 审计 P1 A4 的文档部分）。
