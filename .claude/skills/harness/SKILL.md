---
name: harness
description: "配置 Harness（ harness）。定义专业 Agent，创建 Agent 使用的 Skill 的元技能。使用场景：(1) '配置 harness'、'构建 harness' 请求，(2) 'harness 设计'、'harness 工程' 请求，(3) 为新领域/项目构建基于 harness 的自动化体系，(4) 重新配置或扩展 harness，(5) 'harness 检查'、'harness 审计'、'harness 状态'、'Agent/Skill 同步' 等现有 harness 运维/维护请求。"
---

# Harness — Agent 团队与 Skill 架构师

为领域/项目配置 Harness，定义各 Agent 角色，创建 Agent 使用的 Skill 的元技能。

**核心原则：**
1. 创建 Agent 定义(`.claude/agents/`)和 Skill(`.claude/skills/`)。
2. **Agent 团队作为默认执行模式。**
3. **在 CLAUDE.md 中注册 Harness 指针。** — 仅记录最少指针（触发规则 + 变更历史），使新会话能触发编排器 Skill。
4. **Harness 不是固定产物，而是持续进化的系统。** — 每次执行后收集反馈，持续更新 Agent、Skill、CLAUDE.md。

## 工作流

### Phase 0: 现状审计

Harness Skill 触发后首先检查现有 Harness 状态。

1. 读取 `项目/.claude/agents/`、`项目/.claude/skills/`、`项目/CLAUDE.md`
2. 根据状态分叉执行模式：
   - **新建**: Agent/Skill 目录不存在或为空 → 从 Phase 1 开始完整执行
   - **既有扩展**: 已有 Harness，新增 Agent/Skill → 按下表选择必要 Phase
   - **运维/维护**: 现有 Harness 的审计、修改、同步请求 → 跳转 Phase 7-5 运维/维护工作流

   **既有扩展时 Phase 选择矩阵:**
   | 变更类型 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
   |----------|---------|---------|---------|---------|---------|---------|
   | 新增 Agent | 跳过（使用 Phase 0 结果） | 仅布局决策 | 必须 | 如需专用 Skill | 修改编排器 | 必须 |
   | 新增/修改 Skill | 跳过 | 跳过 | 跳过 | 必须 | 如连接变更 | 必须 |
   | 架构变更 | 跳过 | 必须 | 仅受影响 Agent | 仅受影响 Skill | 必须 | 必须 |
3. 对照现有 Agent/Skill 列表与 CLAUDE.md 记录，检测不一致（drift）
4. 向用户摘要报告审计结果，确认执行计划

### Phase 1: 领域分析
1. 从用户请求中识别领域/项目
2. 识别核心任务类型（生成、验证、编辑、分析等）
3. 基于 Phase 0 审计结果分析现有 Agent/Skill 的冲突/重复
4. 探索项目代码库 — 技术栈、数据模型、主要模块
5. **检测用户熟练度** — 从对话上下文线索（使用的术语、问题水平）判断技术水平，据此调整后续沟通语调。对编程经验较少的用户，不使用 "assertion"、"JSON schema" 等术语而不加解释。

### Phase 2: 团队架构设计

#### 2-1. 执行模式选择

**Agent 团队是最高优先级的默认选项。** 2 个以上 Agent 协作时必须优先考虑 Agent 团队。团队成员通过直接通信（SendMessage）和共享任务列表（TaskCreate）自协调，发现共享、冲突讨论、遗漏补充提升结果质量。

| 模式 | 使用场景 | 特点 |
|------|----------|------|
| **Agent 团队**（默认） | 2 人以上协作，需要实时协调和反馈交换，中间产物相互引用 | 通过 `TeamCreate` + `SendMessage` + `TaskCreate` 自协调 |
| **Sub Agent**（备选） | 单 Agent 任务，结果返回主线程即可，团队通信开销过高 | 直接调用 `Agent` 工具，`run_in_background` 并行 |
| **混合模式** | 各 Phase 特点不同 — 例：并行收集(Sub) → 共识整合(Team) | 按 Phase 级别混合 Team/Sub |

**决策顺序:**
1. 首先审视是否可按 Agent 团队设计 — 2 人以上即为默认
2. 仅当团队通信在结构上不必要（仅结果传递），且团队开销超过收益时才选用 Sub Agent
3. Phase 特点明显不同时考虑混合 — 在编排器中明确各 Phase 执行模式

> 详细比较表和模式决策树参见 `references/agent-design-patterns.md` 的"执行模式"。

#### 2-2. 架构模式选择

1. 将任务分解为专业领域
2. 确定 Agent 团队结构（架构模式参见 `references/agent-design-patterns.md`）
   - **Pipeline（管道）**: 顺序依赖任务
   - **Fan-out/Fan-in（扇出/扇入）**: 并行独立任务
   - **Expert Pool（专家池）**: 按场景选择调用
   - **Producer-Reviewer（生成-验证）**: 生成后质量审查
   - **Supervisor（监督者）**: 中央 Agent 管理状态和动态分配
   - **Hierarchical Delegation（层级委托）**: 上级 Agent 向下级递归委托

#### 2-3. Agent 拆分标准

按专业性、并行性、上下文、复用性四轴判断。详细标准表参见 `references/agent-design-patterns.md` 的"Agent 拆分标准"。

### Phase 3: 创建 Agent 定义

**所有 Agent 必须定义为 `项目/.claude/agents/{name}.md` 文件。** 禁止不创建 Agent 定义文件而直接将角色写入 Agent 工具的 prompt。原因：
- Agent 定义存为文件才能在下个会话复用
- 必须明示团队通信协议，确保 Agent 间协作质量
- Harness 的核心价值在于 Agent（谁）和 Skill（如何）的分离

即使使用内置类型（`general-purpose`、`Explore`、`Plan`），也要创建 Agent 定义文件。内置类型通过 Agent 工具的 `subagent_type` 参数指定，Agent 定义文件承载角色、原则、协议。

**模型设置:** 所有 Agent 使用 `model: "opus"`。Agent 工具调用时必须明确 `model: "opus"` 参数。Harness 的质量直接取决于 Agent 的推理能力，opus 提供最高质量保证。

**团队重组:** Agent 团队每会话只能激活一个团队，但可在 Phase 之间解散并重新组队。如 Pipeline 模式需要不同专家组合，将上一团队的产物保存为文件，清理团队后再创建新团队。

在 `项目/.claude/agents/{name}.md` 中定义每个 Agent。必须章节: 核心角色、工作原则、输入/输出协议、错误处理、协作。Agent 团队模式下添加 `## 团队通信协议` 章节，明示消息收发对象和工作请求范围。

> 定义模板和实际文件全文参见 `references/agent-design-patterns.md` 的"Agent 定义结构" + `references/team-examples.md`。

**包含 QA Agent 时的必要事项:**
- QA Agent 使用 `general-purpose` 类型（`Explore` 只读，无法执行验证脚本）
- QA 的核心不是"存在性检查"，而是 **"边界交叉比较"** — 同时读取 API 响应和前端 hook，对比 shape
- QA 不是整体完成后一次性执行，而是 **每个模块完成后即时增量执行**（incremental QA）
- 详细指南: `references/qa-agent-guide.md`

### Phase 4: 创建 Skill

在 `项目/.claude/skills/{name}/SKILL.md` 创建各 Agent 使用的 Skill。详细编写指南参见 `references/skill-writing-guide.md`。

#### 4-1. Skill 结构

```
skill-name/
├── SKILL.md（必须）
│   ├── YAML frontmatter（name, description 必须）
│   └── Markdown 正文
└── Bundled Resources（可选）
    ├── scripts/    - 重复/确定性任务的执行代码
    ├── references/ - 按需加载的参考文档
    └── assets/     - 输出使用的文件（模板、图片等）
```

#### 4-2. Description 编写 — 主动触发引导

description 是 Skill 的唯一触发机制。Claude 倾向于保守判断触发，因此 description 应 **主动（"pushy"）** 编写。

**差例:** `"处理 PDF 文档的 Skill"`
**好例:** `"PDF 文件读取、文本/表格提取、合并、分割、旋转、水印、加密、OCR 等所有 PDF 操作。提及 .pdf 文件或请求 PDF 产出时必须使用此 Skill。"`

核心: 同时描述 Skill 功能 + 具体触发场景，并与相似但不应触发的情况区分。

#### 4-3. 正文编写原则

| 原则 | 说明 |
|------|------|
| **解释 Why** | 避免 "ALWAYS/NEVER" 等强制指令，传达原因。LLM 理解原因后能在边缘情况正确判断。 |
| **保持 Lean** | 上下文窗口是公共资源。SKILL.md 正文目标 500 行以内，不增重的内容删除或移至 references/。 |
| **通用化** | 避免仅适用特定示例的窄规则，解释原理以应对各种输入。禁止过拟合。 |
| **重复代码打包** | 测试执行中发现 Agent 共同编写的脚本，预先打包到 `scripts/`。 |
| **使用命令式语气** | 使用"执行"、"确保"、"检查"等命令/指示语气。 |

#### 4-4. Progressive Disclosure（渐进式信息披露）

Skill 通过 3 级加载系统管理上下文:

| 级别 | 加载时机 | 大小目标 |
|------|----------|----------|
| **Metadata**（name + description） | 始终在上下文中 | ~100 词 |
| **SKILL.md 正文** | Skill 触发时 | <500 行 |
| **references/** | 仅在需要时 | 无限制（脚本无需加载即可执行） |

**大小管理规则:**
- SKILL.md 接近 500 行时，将细节拆分到 references/，正文留下"何时读哪个文件"的指针
- 300 行以上的 reference 文件顶部包含 **目录（ToC）**
- 如有领域/框架变体，在 references/ 下按领域分离，仅加载相关文件

```
cloud-deploy/
├── SKILL.md（工作流 + 选择指南）
└── references/
    ├── aws.md    ← 仅选择 AWS 时加载
    ├── gcp.md
    └── azure.md
```

#### 4-5. Skill-Agent 连接原则

- Agent 1 个 ↔ Skill 1~N 个（1:1 或 1:多）
- 允许多个 Agent 共享 Skill
- Skill 承载"如何做"，Agent 承载"谁来做"

> 详细编写模式、示例、数据 Schema 标准参见 `references/skill-writing-guide.md`。

### Phase 5: 集成与编排

编排器是 Skill 的特殊形式，将各个 Agent 和 Skill 编织为一个工作流，调谐整个团队。Phase 4 创建的各个 Skill 定义"各 Agent 做什么、怎么做"，编排器定义"谁、何时、按什么顺序协作"。具体模板参见 `references/orchestrator-template.md`。

**既有扩展时修改编排器:** 非新建而是既有扩展时，不创建新编排器，而是修改现有编排器。新增 Agent 时反映团队构成、任务分配、数据流中的新 Agent，并在 description 中添加新 Agent 相关的触发关键词。

Phase 2-1 选择的执行模式决定编排器模式:

#### 5-0. 编排器模式（按模式分类）

**Agent 团队模式（默认）:**
编排器通过 `TeamCreate` 组队，通过 `TaskCreate` 分配任务。团队成员通过 `SendMessage` 直接通信自协调。Leader（编排器）监控进度并汇总结果。

```
[编排器/Leader]
    ├── TeamCreate(team_name, members)
    ├── TaskCreate(tasks with dependencies)
    ├── 团队成员自协调（SendMessage）
    ├── 收集结果并汇总
    └── 清理团队
```

**Sub Agent 模式（备选）:**
编排器通过 `Agent` 工具直接调用 Sub Agent。并行执行使用 `run_in_background: true`，结果仅返回主线程。团队通信不必要且希望降低开销时使用。

```
[编排器]
    ├── Agent(agent-1, run_in_background=true)
    ├── Agent(agent-2, run_in_background=true)
    ├── 等待结果并收集
    └── 生成整合产物
```

**混合模式:**
按 Phase 混合不同模式。常用组合:
- **并行收集(Sub) → 共识整合(Team)**: Phase 2 用 Sub Agent 并行收集独立资料 → Phase 3 组队讨论、共识整合
- **团队生成(Team) → 验证(Sub)**: Phase 2 团队生成初稿 → Phase 3 单个 Sub Agent 独立验证
- **Phase 间团队重组**: 每个 Phase 执行 `TeamDelete` 后新建 `TeamCreate`，中间插入 Sub Agent 调用

混合模式时在编排器各 Phase 章节顶部注明该 Phase 的执行模式（例: `**执行模式:** Agent 团队`）。

#### 5-1. 数据传递协议

在编排器中明示 Agent 间数据传递方式:

| 策略 | 方式 | 适用模式 | 适合场景 |
|------|------|----------|-----------|
| **消息驱动** | `SendMessage` 团队成员直接通信 | 团队 | 实时协调、反馈交换、轻量状态传递 |
| **任务驱动** | `TaskCreate`/`TaskUpdate` 共享工作状态 | 团队 | 进度跟踪、依赖管理、任务本身请求 |
| **文件驱动** | 约定路径读写文件 | 团队 + Sub | 大容量数据、结构化产物、需要审计追溯 |
| **返回值驱动** | `Agent` 工具的返回消息 | Sub | 主线程直接收集 Sub Agent 结果 |

**推荐组合（团队模式）:** 任务驱动（协调）+ 文件驱动（产物）+ 消息驱动（实时通信）
**推荐组合（Sub 模式）:** 返回值驱动（结果收集）+ 文件驱动（大容量产物）
**混合模式:** 按各 Phase 执行模式应用对应组合

文件驱动传递规则:
- 工作目录下创建 `_workspace/` 文件夹存储中间产物
- 文件名约定: `{phase}_{agent}_{artifact}.{ext}`（例: `01_analyst_requirements.md`）
- 仅将最终产物输出到用户指定路径，中间文件（`_workspace/`）保留（用于事后验证、审计追溯）

#### 5-2. 错误处理

编排器内包含错误处理方针。核心原则: 1 次重试后再失败时跳过该结果继续（在报告中注明缺失），冲突数据不删除而并行标注来源。

> 按错误类型的策略表和实现细节参见 `references/orchestrator-template.md` 的"错误处理"。

#### 5-3. 团队规模指南

| 任务规模 | 推荐成员数 | 每成员任务数 |
|----------|------------|--------------|
| 小规模（5~10 个任务） | 2~3 人 | 3~5 个 |
| 中规模（10~20 个任务） | 3~5 人 | 4~6 个 |
| 大规模（20 个+ 任务） | 5~7 人 | 4~5 个 |

> 成员越多协调开销越大。3 个专注成员胜过 5 个分散成员。

#### 5-4. CLAUDE.md Harness 指针注册

Harness 配置完成后，在项目 `CLAUDE.md` 中注册最少指针。CLAUDE.md 每个新会话都加载，仅记录 Harness 存在和触发规则，编排器 Skill 处理其余。

**CLAUDE.md 模板:**

````markdown
## Harness: {领域名}

**目标:** {Harness 核心目标一行}

**触发:** 与 {领域} 相关工作请求时使用 `{orchestrator-skill-name}` Skill。简单提问可直接回应。

**变更历史:**
| 日期 | 变更内容 | 对象 | 原因 |
|------|----------|------|------|
| {YYYY-MM-DD} | 初始配置 | 全部 | - |
````

**不放入 CLAUDE.md 的内容:** Agent 列表、Skill 列表、目录结构、执行规则详情。原因: Agent/Skill 列表由编排器 Skill 和 `.claude/agents/`、`.claude/skills/` 管理，属重复。目录结构可直接从文件系统确认。CLAUDE.md 仅承载 **指针（触发规则）+ 变更历史**。

#### 5-5. 后续任务支持

编排器不仅要处理初始执行，还需处理后续任务。确保以下三点:

**1. 编排器 description 包含后续关键词:**
仅初始生成关键词不足以触发后续请求。description 必须包含的后续表达:
- "重新执行"、"再次执行"、"更新"、"修改"、"补充"
- "仅重新执行 {领域} 的 {部分任务}"
- "基于之前结果"、"改进结果"

**2. 编排器 Phase 1 添加上下文检查步骤:**
工作流启动时检查既有产物存在与否，决定执行模式:
- `_workspace/` 存在 + 用户请求部分修改 → **部分重执行**（仅重调用相关 Agent）
- `_workspace/` 存在 + 用户提供新输入 → **新执行**（既有 _workspace 移至 `_workspace_prev/`）
- `_workspace/` 不存在 → **初始执行**

**3. Agent 定义包含再调用指南:**
各 Agent `.md` 文件中明示"当已有之前产物时的行为":
- 如果之前结果文件存在，读取并反映改进点
- 如果用户反馈已给出，仅修改相应部分

> 编排器模板的 "Phase 0: 上下文检查" 章节参见: `references/orchestrator-template.md`

### Phase 6: 验证与测试

验证生成的 Harness。详细测试方法论参见 `references/skill-testing-guide.md`。

#### 6-1. 结构验证

- 确认所有 Agent 文件在正确位置
- 验证 Skill 的 frontmatter（name, description）
- 确认 Agent 间引用一致性
- 确认未生成 command

#### 6-2. 按执行模式验证

- **Agent 团队**: 确认成员间通信路径、任务依赖、团队规模合理性
- **Sub Agent**: 确认各 Agent 的输入输出连接、`run_in_background` 设置、返回值收集逻辑
- **混合模式**: 确认各 Phase 执行模式已在编排器中明示，Phase 边界数据传递无间断（团队 → Sub 转换时团队产物是否连接为 Sub 的输入）

#### 6-3. Skill 执行测试

对生成的每个 Skill 执行实际测试:

1. **编写测试 Prompt** — 每个 Skill 编写 2~3 个现实的测试 Prompt。使用实际用户会输入的具体、自然语句。

2. **With-skill vs Without-skill 对比执行** — 尽可能并行执行有无 Skill 的运行，确认 Skill 的附加值。每次 spawn 两个 Agent:
   - **With-skill**: 读取 Skill 后执行任务
   - **Without-skill (baseline)**: 同一 Prompt 不用 Skill 执行

3. **结果评估** — 定性（用户评审）+ 定量（assertion 驱动）评估产物质量。产物可客观验证时（文件生成、数据提取等）定义 assertion，主观时（文风、设计）依赖用户反馈。

4. **迭代改进循环** — 测试结果发现问题时:
   - 将反馈 **通用化** 后修改 Skill（禁止仅适用特定示例的窄修改）
   - 修改后重新测试
   - 重复直至用户满意或无意义改进不再出现

5. **重复模式打包** — 测试执行中发现 Agent 共同编写的代码（例：所有测试中生成相同辅助脚本），将其预先打包到 `scripts/`。

#### 6-4. 触发验证

验证各 Skill 的 description 是否正确触发:

1. **Should-trigger 查询**（8~10 个）— 应触发 Skill 的各种表达（正式/随意、显式/隐式）
2. **Should-NOT-trigger 查询**（8~10 个）— 关键词相似但应由其他工具/Skill 处理的 "near-miss" 查询

**near-miss 编写核心:** "写斐波那契函数" 这类明显无关的查询无测试价值。"把 Excel 的图表提取为 PNG"（xlsx Skill vs 图像转换）这样 **边界模糊的查询** 才是好的测试用例。

此步骤也检查与既有 Skill 的触发冲突。

#### 6-5. 干运行测试

- 审视编排器 Skill 的 Phase 顺序是否合理
- 确认数据传递路径无死链接（dead link）
- 确认所有 Agent 的输入与上一 Phase 的输出匹配
- 确认各错误场景的回退路径可执行

#### 6-6. 测试场景编写

- 编排器 Skill 中添加 `## 测试场景` 章节
- 描述正常流程 1 个 + 错误流程 1 个以上

### Phase 7: Harness 进化

Harness 不是一次创建就结束的静态产物，而是随用户反馈持续进化的系统。

#### 7-1. 执行后反馈收集

每次 Harness 执行完成后向用户请求反馈:
- "结果中有需要改进的地方吗？"
- "Agent 团队构成或工作流有想改变的地方吗？"

没有反馈就跳过。不强求，但必须提供机会。

#### 7-2. 反馈反映路径

按反馈类型修改对象不同:

| 反馈类型 | 修改对象 | 示例 |
|-----------|----------|------|
| 产物质量 | 对应 Agent 的 Skill | "分析太肤浅" → Skill 添加深度标准 |
| Agent 角色 | Agent 定义 `.md` | "安全审查也需要" → 新增 Agent |
| 工作流顺序 | 编排器 Skill | "应该先验证" → Phase 顺序变更 |
| 团队构成 | 编排器 + Agent | "这两个可以合并" → Agent 合并 |
| 触发遗漏 | Skill description | "用这种表达不工作" → description 扩展 |

#### 7-3. 变更历史

所有变更记录在 CLAUDE.md 的 **变更历史** 表（与 Phase 5-4 模板的"变更历史"节相同表）:

```markdown
**变更历史:**
| 日期 | 变更内容 | 对象 | 原因 |
|------|----------|------|------|
| 2026-04-05 | 初始配置 | 全部 | - |
| 2026-04-07 | 添加 QA Agent | agents/qa.md | 产物质量验证不足反馈 |
| 2026-04-10 | 添加语调指南 | skills/content-creator | "太生硬"反馈 |
```

此历史追踪 Harness 进化方向，防止回归（regression）。

#### 7-4. 进化触发

不仅在用户明确说"修改 Harness"时，以下情境也主动建议进化:
- 同一类型反馈出现 2 次以上
- 发现 Agent 重复失败的 pattern
- 观察到用户绕过编排器手动操作

#### 7-5. 运维/维护工作流

对现有 Harness 的系统性检查、修改、同步。Phase 0 进入"运维/维护"分叉时遵循此工作流。

**Step 1: 现状审计**
- 对比 `.claude/agents/` 文件列表与编排器 Skill 的 Agent 配置 → 生成不一致列表
- 对比 `.claude/skills/` 目录列表与编排器 Skill 的 Skill 配置 → 生成不一致列表
- 向用户报告审计结果

**Step 2: 增量添加/修改**
- 按用户请求执行 Agent 添加/修改/删除、Skill 添加/修改/删除
- 每次仅一个变更，每个变更后立即执行 Step 3（同步）

**Step 3: 更新 CLAUDE.md 变更历史**
- 在变更历史表中记录日期、变更内容、对象、原因

**Step 4: 变更验证**
- 修改后的 Agent/Skill 结构验证（Phase 6-1 标准）
- 修改范围影响触发时进行触发验证（Phase 6-4 标准）
- 大规模变更（架构变更，Agent 3 个以上添加/删除）时执行到 Phase 6-3（执行测试）、6-5（干运行）
- CLAUDE.md 与实际文件一致性最终确认

## 产物检查清单

生成完成后确认:

- [ ] `项目/.claude/agents/` — **Agent 定义文件必须创建**（内置类型也必须创建文件）
- [ ] `项目/.claude/skills/` — Skill 文件（SKILL.md + references/）
- [ ] 1 个编排器 Skill（包含数据流 + 错误处理 + 测试场景）
- [ ] 明示执行模式（Agent 团队 / Sub Agent / 混合模式 三者选一，混合模式下注明各 Phase 模式）
- [ ] 所有 Agent 调用包含 `model: "opus"` 参数
- [ ] `.claude/commands/` — 不生成任何内容
- [ ] 与既有 Agent/Skill 无冲突
- [ ] Skill description 主动（"pushy"）编写 — **包含后续任务关键词**
- [ ] SKILL.md 正文 500 行以内，超过则拆分到 references/
- [ ] 2~3 个测试 Prompt 执行验证完成
- [ ] 触发验证（should-trigger + should-NOT-trigger）完成
- [ ] **CLAUDE.md 中注册 Harness 指针**（触发规则 + 变更历史）
- [ ] **CLAUDE.md 变更历史中记录 Agent/Skill 添加/删除/修改**
- [ ] **编排器 Phase 1 包含上下文检查步骤**（初始/后续/部分重执行判定）

## 参考

- Harness 模式: `references/agent-design-patterns.md`
- 既有 Harness 示例（含实际文件全文）: `references/team-examples.md`
- 编排器模板: `references/orchestrator-template.md`
- **Skill 编写指南**: `references/skill-writing-guide.md` — 编写模式、示例、数据 Schema 标准
- **Skill 测试指南**: `references/skill-testing-guide.md` — 测试/评估/迭代改进方法论
- **QA Agent 指南**: `references/qa-agent-guide.md` — 构建 Harness 中包含 QA Agent 时参考。包含集成一致性验证方法论、边界 Bug 模式、QA Agent 定义模板。基于实际项目发现的 7 个 Bug 案例。
