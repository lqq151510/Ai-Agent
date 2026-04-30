# 编排器 Skill 模板

编排器是调谐整个团队的上层 Skill。按执行模式提供 3 种模板:

- **模板 A: Agent 团队模式（默认）** — 2 人以上协作时最优先选择
- **模板 B: Sub Agent 模式（备选）** — 团队通信不必要时
- **模板 C: 混合模式** — 各 Phase 混合不同模式

---

## 模板 A: Agent 团队模式（默认 · 最优先选择）

2 人以上 Agent 协作时 **最先考虑的基本模式**。通过 `TeamCreate` 组队，通过共享任务列表和 `SendMessage` 协调。

```markdown
---
name: {domain}-orchestrator
description: "调谐 {领域} Agent 团队的编排器。{初始执行关键词}。后续任务: 修改{领域}结果、部分重执行、更新、补充、重新执行、改进之前结果时也必须使用此 Skill。"
---

# {Domain} Orchestrator

调谐 {领域} Agent 团队，生成 {最终产物} 的集成 Skill。

## 执行模式: Agent 团队

## Agent 配置

| 成员 | Agent 类型 | 角色 | Skill | 输出 |
|------|-------------|------|------|------|
| {teammate-1} | {自定义或内置} | {角色} | {skill} | {output-file} |
| {teammate-2} | {自定义或内置} | {角色} | {skill} | {output-file} |
| ... | | | | |

## 工作流

### Phase 0: 上下文检查（后续任务支持）

确认既有产物存在与否，决定执行模式:

1. 确认 `_workspace/` 目录是否存在
2. 决定执行模式:
   - **`_workspace/` 不存在** → 初始执行。进入 Phase 1
   - **`_workspace/` 存在 + 用户请求部分修改** → 部分重执行。仅重调用对应 Agent，仅覆盖既有产物中的修改对象
   - **`_workspace/` 存在 + 提供新输入** → 新执行。既有 `_workspace/` 移至 `_workspace_{YYYYMMDD_HHMMSS}/` 后进入 Phase 1
3. 部分重执行时: 将之前产物路径包含在 Agent Prompt 中，指示 Agent 读取既有结果并反映反馈

### Phase 1: 准备
1. 分析用户输入 — {要识别的信息}
2. 在工作目录创建 `_workspace/`
   - **初始执行**: 创建新 `_workspace/`
   - **新执行**: 将既有 `_workspace/` 移至 `_workspace_{YYYYMMDD_HHMMSS}/` 后立即重建 `_workspace/`
3. 保存输入数据到 `_workspace/00_input/`

### Phase 2: 团队组建

1. 创建团队:
   ```
   TeamCreate(
     team_name: "{domain}-team",
     members: [
       { name: "{teammate-1}", agent_type: "{type}", model: "opus", prompt: "{角色描述及任务指示}" },
       { name: "{teammate-2}", agent_type: "{type}", model: "opus", prompt: "{角色描述及任务指示}" },
       ...
     ]
   )
   ```

2. 注册任务:
   ```
   TaskCreate(tasks: [
     { title: "{任务1}", description: "{详情}", assignee: "{teammate-1}" },
     { title: "{任务2}", description: "{详情}", assignee: "{teammate-2}" },
     { title: "{任务3}", description: "{详情}", depends_on: ["{任务1}"] },
     ...
   ])
   ```

   > 每成员 5~6 个任务为佳。有依赖关系的任务用 `depends_on` 明示。

### Phase 3: {主要工作 — 例: 调查/生成/分析}

**执行方式:** 成员自协调

成员从共享任务列表请求（claim）任务并独立执行。
Leader 监控进度，必要时干预。

**成员间通信规则:**
- {teammate-1} 通过 SendMessage 向 {teammate-2} 传递 {什么信息}
- {teammate-2} 完成任务后将结果保存为文件并通知 Leader
- 成员需要其他成员的结果时通过 SendMessage 请求

**产物保存:**

| 成员 | 输出路径 |
|------|----------|
| {teammate-1} | `_workspace/{phase}_{teammate-1}_{artifact}.md` |
| {teammate-2} | `_workspace/{phase}_{teammate-2}_{artifact}.md` |

**Leader 监控:**
- 成员空闲时自动接收通知
- 特定成员受阻时通过 SendMessage 指示或重分配任务
- 通过 TaskGet 确认整体进度

### Phase 4: {后续工作 — 例: 验证/整合}
1. 等待所有成员任务完成（通过 TaskGet 确认状态）
2. 通过 Read 收集各成员产物
3. {整合/验证逻辑}
4. 生成最终产物: `{output-path}/{filename}`

### Phase 5: 清理
1. 向成员请求终止（SendMessage）
2. 清理团队（TeamDelete）
3. 保留 `_workspace/` 目录（中间产物不删除 — 用于事后验证和审计追溯）
4. 向用户报告结果摘要

> **需要团队重组时:** Phase 间需要不同专家组合时，用 TeamDelete 清理当前团队，再用 TeamCreate 创建下个 Phase 的团队。上团队的产物保存在 `_workspace/` 中，新团队可通过 Read 访问。

## 数据流

```
[Leader] → TeamCreate → [teammate-1] ←SendMessage→ [teammate-2]
                          │                           │
                          ↓                           ↓
                    artifact-1.md              artifact-2.md
                          │                           │
                          └───────── Read ────────────┘
                                     ↓
                              [Leader: 整合]
                                     ↓
                              最终产物
```

## 错误处理

| 情境 | 策略 |
|------|------|
| 1 名成员失败/停止 | Leader 检测 → SendMessage 确认状态 → 重启或创建替代成员 |
| 过半成员失败 | 通知用户并确认是否继续 |
| 超时 | 使用当前收集的部分结果，终止未完成成员 |
| 成员间数据冲突 | 标注来源后并行记录，不删除 |
| 任务状态延迟 | Leader 通过 TaskGet 确认后手动 TaskUpdate |

## 测试场景

### 正常流程
1. 用户提供 {输入}
2. Phase 1 导出 {分析结果}
3. Phase 2 组队（{N} 名成员 + {M} 个任务）
4. Phase 3 成员自协调执行任务
5. Phase 4 整合产物生成最终结果
6. Phase 5 清理团队
7. 预期结果: 生成 `{output-path}/{filename}`

### 错误流程
1. Phase 3 中 {teammate-2} 因错误停止
2. Leader 收到空闲通知
3. SendMessage 确认状态 → 尝试重启
4. 重启失败时将 {teammate-2} 任务重分配给 {teammate-1}
5. 用其余结果继续 Phase 4
6. 最终报告注明"{teammate-2} 领域部分未收集"
```

---

## 模板 B: Sub Agent 模式（备选）

团队通信开销不必要的情况。通过 `Agent` 工具直接调用，凭返回值收集结果。

```markdown
---
name: {domain}-orchestrator
description: "调谐 {领域} Agent 的编排器。{初始执行关键词}。包含后续任务关键词。"
---

## 执行模式: Sub Agent

## Agent 配置

| Agent | subagent_type | 角色 | Skill | 输出 |
|---------|--------------|------|------|------|
| {agent-1} | {内置或自定义} | {角色} | {skill} | {output-file} |
| {agent-2} | ... | ... | ... | ... |

## 工作流

### Phase 0: 上下文检查
（与模板 A 相同 — `_workspace/` 存在与否分叉）

### Phase 1: 准备
1. 分析输入
2. 创建 `_workspace/`（初始执行时，或新执行中将既有 `_workspace/` 移至归档目录后立即创建）

### Phase 2: 并行执行
单条消息中同时调用 N 个 Agent 工具:

| Agent | 输入 | 输出 | model | run_in_background |
|---------|------|------|-------|-------------------|
| {agent-1} | {源} | `_workspace/{phase}_{agent}_{artifact}.md` | opus | true |
| {agent-2} | {源} | `_workspace/{phase}_{agent}_{artifact}.md` | opus | true |

### Phase 3: 整合
1. 收集各 Agent 返回值
2. 文件产物通过 Read 收集
3. 应用整合逻辑 → 最终产物

### Phase 4: 清理
1. 保留 `_workspace/`
2. 报告结果摘要

## 错误处理
- 1 个 Agent 失败: 1 次重试。重失败时注明缺失继续
- 过半失败: 通知用户确认是否继续
- 超时: 使用当前收集的部分结果
```

---

## 模板 C: 混合模式

各 Phase 使用不同执行模式。每个 Phase 顶部注明 `**执行模式:** {团队 | Sub}`。

```markdown
---
name: {domain}-orchestrator
description: "{领域} 编排器（混合模式）。{关键词}。包含后续任务关键词。"
---

## 执行模式: 混合

| Phase | 模式 | 理由 |
|-------|------|------|
| Phase 2（并行收集） | Sub Agent | 独立资料收集，团队通信不必要 |
| Phase 3（共识整合） | Agent 团队 | 需要冲突数据讨论与共识 |
| Phase 4（独立验证） | Sub Agent | QA Agent 1 人客观验证 |

## 工作流

### Phase 2: 并行资料收集
**执行模式:** Sub Agent

单条消息中用 Agent 工具并行调用 N 个 Agent（`run_in_background: true`）。
各结果保存到 `_workspace/02_{agent}_raw.md`。

### Phase 3: 共识驱动整合
**执行模式:** Agent 团队

1. `TeamCreate` 组建整合团队（editor + fact-checker + synthesizer）
2. `TaskCreate` 分配任务 — 所有成员读取 Phase 2 的 `_workspace/02_*` 文件
3. 成员通过 `SendMessage` 讨论冲突数据，文件驱动达成共识
4. 生成最终整合版 `_workspace/03_integrated.md`
5. `TeamDelete` 清理团队

### Phase 4: 独立验证
**执行模式:** Sub Agent

单个 QA Sub Agent 以 `_workspace/03_integrated.md` 为输入，生成验证报告。
```

**混合切换规则:**
- 团队 → Sub: 必须通过 `TeamDelete` 清理团队后调用 Agent 工具
- Sub → 团队: 将 Sub Agent 的文件产物作为 Read 路径传递给团队成员
- 团队 → 团队: 清理上团队后新建 `TeamCreate`（每会话仅 1 团队可激活）

---

## 编写原则

1. **先明确执行模式** — 编排器顶部注明"Agent 团队"/"Sub Agent"/"混合"之一。混合模式必须包含 Phase 模式表
2. **团队模式具体说明 TeamCreate/SendMessage/TaskCreate 用法** — 团队构成、任务注册、通信规则
3. **Sub 模式完整明示 Agent 工具参数** — name、subagent_type、prompt、run_in_background、model
4. **文件路径使用绝对路径** — 禁止相对路径，以 `_workspace/` 为基准的清晰路径
5. **明示 Phase 间依赖** — 哪个 Phase 依赖哪个 Phase 的结果。混合模式特别注意模式切换点
6. **错误处理现实化** — 不假设"一切成功"
7. **测试场景必须** — 正常 1 + 错误 1 以上

## description 编写时包含后续任务关键词

编排器 description 仅凭初始执行关键词不足。必须包含以下后续任务表达:

- 重新执行/再次执行/更新/修改/补充
- "仅重做 {领域} 的 {部分}"
- "基于之前结果"、"改进结果"
- 领域相关的日常请求

没有后续关键词，首次执行后 Harness 实际上成为死代码。

## 实际编排器参考

Fan-out/Fan-in 模式编排器的基本结构:
准备 → Phase 0（上下文检查）→ TeamCreate + TaskCreate → N 个成员并行执行 → Read + 整合 → 清理。
详见 `references/team-examples.md` 的调研团队示例。
