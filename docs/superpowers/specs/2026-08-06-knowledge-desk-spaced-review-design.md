# Knowledge Desk 本机间隔复习设计

> 状态：已实现并完成自动回归；真实 Electron + 本机知识服务的数据写入 smoke 待人工验收。
>
> 范围：仅本机 Knowledge Desk；不依赖云端模型、同步服务或系统通知。

## 1. 目标与边界

Knowledge Desk 已经具备“收集资料 → 整理 → 检索找回”的主链路。本设计新增“主动回顾”闭环，让已整理的知识条目按用户的掌握反馈再次出现。

首版只实现确定性的离线间隔复习：用户阅读资料标题与回忆提示，按需展开摘要/标签或打开条目详情，然后选择 `again`、`hard`、`good`、`easy` 之一。系统据此保存下次复习时间。

明确不做：

- 不调用任何模型生成题目、评分或总结。
- 不上传复习内容、反馈、原件或复习记录。
- 不发送 macOS 通知、邮件或跨设备同步。
- 不修改知识条目的正文、摘要、标签、状态或受管原件。

## 2. 用户体验

### 2.1 入口

主导航新增“每日回顾”页面；工作台增加“今日待回顾”卡片，显示到期数和预计时长。点击后进入队列，而非直接打开原文。

### 2.2 回顾卡

每次只展示一条已整理且未归档的资料：标题、来源类型、标签和一个基于标题/摘要的本地回忆提示。用户先自行回想，再选择“显示摘要与标签”或“打开详情”。

显示答案后，四个反馈按钮保存本次结果并自动切换至下一条：

| 反馈 | 含义 | 首次/后续间隔规则 |
| --- | --- | --- |
| `again` | 没有记住 | 1 天；重复次数清零；难度系数最低不低于 1.3 |
| `hard` | 需要很大提示 | 至少 1 天，按当前间隔 × 1.2；难度系数 -0.15 |
| `good` | 正常掌握 | 首次 1 天、第二次 3 天，之后按当前间隔 × 难度系数 |
| `easy` | 很轻松 | 首次 3 天、第二次 7 天，之后按当前间隔 × (难度系数 + 0.15)；难度系数 +0.15 |

所有间隔均向上取整为完整天数，`dueAt` 为提交反馈的当前时刻加上对应天数。队列默认一次读取 10 条，到期条目优先于尚未有复习记录的已整理条目。

### 2.3 队列规则

- 只有状态为 `ready` 的条目进入候选集；`inbox`、`processing`、`failed` 和 `archived` 永不进入。
- 已归档条目的既有复习状态保留但不会展示；恢复为 `ready` 后若已到期即可重新出现。
- 没有状态记录的旧条目视为“首次回顾”，无需迁移时批量写入历史数据。
- 同一用户只能为同一知识条目拥有一份当前复习状态。
- 复习页允许中途退出；未提交反馈的当前条目不会被标记完成。

## 3. 后端模型与接口

新增 `knowledge_review_states`：

| 字段 | 含义 |
| --- | --- |
| `id` | UUID 主键 |
| `user_id`、`knowledge_item_id` | 所属用户和知识条目，二者联合唯一 |
| `due_at` | 下一次到期时间 |
| `interval_days`、`ease_factor`、`repetitions` | 间隔算法状态 |
| `last_rating`、`last_reviewed_at` | 最近反馈和时间 |
| `created_at`、`updated_at` | 审计时间 |

新增 PostgreSQL 与 H2 的 V13 migration，并建立 `(user_id, due_at)` 索引。服务层使用可注入 `Clock`，使到期计算和测试可重复。

新增独立的 `KnowledgeReviewService`，只依赖资料与复习状态仓储，不让回顾规则泄漏到控制器、Electron 或 renderer。它提供：

```text
GET  /api/v1/knowledge-reviews/queue?limit=10
POST /api/v1/knowledge-reviews/{itemId}/complete
     body: { "rating": "again|hard|good|easy" }
GET  /api/v1/knowledge-reviews/summary
```

`queue` 返回安全的精简条目（ID、标题、来源类型、摘要、标签、更新时间、到期信息）和总到期数，不返回文件路径、内容哈希、受管原件位置或完整正文。`complete` 必须验证条目归属、状态为 `ready`，并以数据库唯一约束/更新语义保证同一条目状态不会重复创建。

工作台的 `DashboardSummaryResponse` 新增只读 `review` 摘要（`dueCount`、`nextDueAt`），避免 renderer 为一个徽标执行 N+1 请求。

## 4. 备份与恢复

本机备份新增可选 `reviewStates`。每条记录只保存源知识条目 ID、算法状态、最近反馈与时间；不保存模型配置、原件二进制、绝对路径、哈希或完整正文。

恢复时现有备份逻辑会为知识条目生成新 ID；因此必须先建立旧条目 ID → 新条目 ID 的映射，再恢复对应的复习状态。引用不存在、既非 `ready` 也非 `archived` 或重复的条目状态会被拒绝为无效备份，而不是静默绑定到错误条目。已归档条目的状态保留，恢复为 `ready` 后按原到期时间继续；旧的 `schemaVersion: 1` 备份没有 `reviewStates` 时保持完全兼容。

## 5. Renderer 与本机边界

- `MainPage` 增加 `review`，在桌面导航和移动导航同时可达。
- 新增 `ReviewPage`，采用现有 `knowledgeDeskApi` 的窄包装器调用后端；浏览器预览没有真实 API 时明确显示“每日回顾需要本机知识服务”，不伪造进度。
- 工作台卡片和导航徽标来自 `dashboard.review.dueCount`；提交反馈后刷新回顾队列和工作台摘要。
- “打开详情”复用现有详情页；若条目有受管原件，仍只使用现有 opaque `assetId` IPC。
- Electron main-process allowlist 只允许 `GET queue`、`GET summary` 与 `POST /{UUID}/complete` 三条精确路由；未知 review 子路径一律拒绝。
- 不新增 renderer 到文件系统、路径、Shell 或通用 Electron IPC 的访问。

## 6. 验收与测试

后端：

1. 只返回当前用户的 `ready` 条目；归档与其他状态均被排除。
2. 首次回顾与四种反馈均生成确定的下次时间、间隔、难度与次数。
3. 不能为别人的条目、非 `ready` 条目或非法 rating 提交反馈。
4. 同一条目不会产生多条当前状态；并发/重试仍保持单一状态。
5. dashboard 摘要准确给出到期数和下一次到期时间。
6. 备份导出/恢复保留复习状态，旧备份仍可导入，且新条目 ID 映射正确。

桌面与 renderer：

1. API 映射只接受安全字段并拒绝未知/非法 rating。
2. 回顾页的隐藏答案、评分、完成态、空队列和错误态均可测试。
3. 回顾徽标刷新不影响收集箱、知识库、受管资料源或详情页。
4. TypeScript、lint、renderer 测试与 build 通过；主进程现有测试无回归。

## 7. 实施顺序

1. 创建 migration、实体、仓储、DTO 与确定性复习服务。
2. 添加控制器、dashboard 摘要和备份/恢复映射，补充后端测试。
3. 接入 API 类型、导航、工作台卡片和回顾页，补充 renderer 测试。
4. 运行后端、desktop main、renderer 的定向与全量回归；再进行手动桌面 smoke。

## 8. 已完成验证（2026-08-06）

- `mvn -q -pl backend -am test`：220 个测试通过，14 个按既有条件跳过。
- `cd desktop && npm run test:main`：19 个主进程测试通过。
- `cd desktop/src/renderer && npm run lint && npm test -- --run && npm run build`：lint、32 个测试和 production build 通过。
- 浏览器预览 smoke：工作台显示“每日回顾”卡片和导航；缺少本机 bridge 时页面明确拒绝伪造复习进度，控制台无 error。
- 全仓 Spotless 仍报告既有格式违规（含本次测试文件中已有的旧格式行）；为避免混入无关格式化，未执行全仓自动格式化。
