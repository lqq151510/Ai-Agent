# Agent 团队示例

---

## 示例 1: 调研团队（Agent 团队模式）

### 团队架构: Fan-out/Fan-in
### 执行模式: Agent 团队

```
[Leader/编排器]
    ├── TeamCreate(research-team)
    ├── TaskCreate(4 个调研任务)
    ├── 成员自协调（SendMessage）
    ├── 收集结果（Read）
    └── 生成综合报告
```

### Agent 配置

| 成员 | Agent 类型 | 角色 | 输出 |
|------|-------------|------|------|
| official-researcher | general-purpose | 官方文档/博客 | research_official.md |
| media-researcher | general-purpose | 媒体/投资 | research_media.md |
| community-researcher | general-purpose | 社区/SNS | research_community.md |
| background-researcher | general-purpose | 背景/竞争/学术 | research_background.md |
| (Leader = 编排器) | — | 整合报告 | 综合报告.md |

> 调研 Agent 使用 `general-purpose` 内置类型，但必须在 `.claude/agents/{name}.md` 文件中定义。文件中明示角色、调研范围、团队通信协议，确保复用性和协作质量。

### 编排器工作流（Agent 团队）

```
Phase 1: 准备
  - 分析用户输入（识别主题、调研模式）
  - 创建 _workspace/

Phase 2: 团队组建
  - TeamCreate(team_name: "research-team", members: [
      { name: "official", prompt: "官方渠道调研..." },
      { name: "media", prompt: "媒体/投资动态调研..." },
      { name: "community", prompt: "社区反应调研..." },
      { name: "background", prompt: "背景/竞争环境调研..." }
    ])
  - TaskCreate(tasks: [
      { title: "官方渠道调研", assignee: "official" },
      { title: "媒体动态调研", assignee: "media" },
      { title: "社区反应调研", assignee: "community" },
      { title: "背景环境调研", assignee: "background" }
    ])

Phase 3: 调研执行
  - 4 名成员独立调研
  - 有趣发现通过 SendMessage 成员间共享
    （例: media 发现投资新闻发送给 background）
  - 冲突信息发现时成员间直接讨论
  - 各成员完成时保存文件 + 通知 Leader

Phase 4: 整合
  - Leader Read 收集 4 个产物
  - 生成综合报告
  - 冲突信息标注来源

Phase 5: 清理
  - 请求成员终止
  - 清理团队
  - 保留 _workspace/（用于事后验证和审计追溯）
```

### 团队通信模式

```
official ──SendMessage──→ background  （分享相关官方公告）
media ────SendMessage──→ background  （分享投资/收购信息）
community ─SendMessage──→ media      （社区反应中的媒体相关信息）
所有成员 ──TaskUpdate──→ 共享任务列表  （进度更新）
Leader ←───── 空闲通知 ──── 完成任务成员   （自动）
```

---

## 示例 2: 科幻小说写作团队（Agent 团队模式）

### 团队架构: Pipeline + Fan-out
### 执行模式: Agent 团队

```
Phase 1（并行 — Agent 团队）: worldbuilder + character-designer + plot-architect
  → 通过 SendMessage 协调一致性
Phase 2（顺序）: prose-stylist（写作）
Phase 3（并行 — Agent 团队）: science-consultant + continuity-manager（审查）
  → 通过 SendMessage 共享发现
Phase 4（顺序）: prose-stylist（反映审查意见修改）
```

### Agent 配置

| 成员 | Agent 类型 | 角色 | Skill |
|------|-------------|------|------|
| worldbuilder | 自定义 | 世界观构建 | world-setting |
| character-designer | 自定义 | 角色设计 | character-profile |
| plot-architect | 自定义 | 情节结构 | outline |
| prose-stylist | 自定义 | 文风编辑 + 写作 | write-scene, review-chapter |
| science-consultant | 自定义 | 科学验证 | science-check |
| continuity-manager | 自定义 | 一致性验证 | consistency-check |

### Agent 文件完整示例: `worldbuilder.md`

```markdown
---
name: worldbuilder
description: "科幻小说世界观构建专家。设计物理法则、社会结构、技术水平、历史。"
---

# Worldbuilder — 科幻世界观设计专家

你是科幻小说世界观设计专家。基于科学事实但扩展想象力，构建故事展开世界的物理、社会、技术基础。

## 核心角色
1. 定义世界物理法则和技术水平
2. 设计社会结构、政治体系、经济系统
3. 建立历史脉络和当前冲突结构
4. 描写各场景环境与氛围

## 工作原则
- 内部一致性最优先 — 设定间不可有矛盾
- "如果有这技术？" 的连锁追问推断世界波及效应
- 世界观服务于故事 — 避免干扰情节的过度设定

## 输入/输出协议
- 输入: 用户的世界观概念、类型要求
- 输出: `_workspace/01_worldbuilder_setting.md`
- 格式: Markdown。按节分（物理/社会/技术/历史/场景）

## 团队通信协议
- 向 character-designer: SendMessage 传递社会结构、阶级系统、职业群信息
- 向 plot-architect: SendMessage 传递世界主要冲突结构、危机要素
- 从 science-consultant: 接收科学错误反馈 → 修正设定
- 世界观变更时向所有相关成员广播

## 错误处理
- 概念模糊时提出 3 个方向并请求选择
- 发现科学错误时附带替代方案

## 协作
- 向 character-designer 提供社会结构信息
- 向 plot-architect 提供冲突结构信息
- 反映 science-consultant 的反馈修正设定
```

### 团队工作流详细

```
Phase 1: TeamCreate(team_name: "novel-team", members: [worldbuilder, character-designer, plot-architect])
         TaskCreate([世界观构建, 角色设计, 情节结构])
         → 成员自协调并行作业
         → worldbuilder 完成社会结构时 SendMessage 给 character-designer
         → character-designer 完成主角设定时 SendMessage 给 plot-architect

Phase 2: 清理 Phase 1 团队 → 调用 prose-stylist 为 Sub Agent（单独写作无需团队）
         prose-stylist 读取 _workspace/ 的 3 个产物进行写作
         → 结果保存到 _workspace/02_prose_draft.md

Phase 3: 创建新团队 — TeamCreate(team_name: "review-team", members: [science-consultant, continuity-manager])
         （每会话仅一团队可激活，但 Phase 1 团队已清理，可创建新团队）
         → 两位审查员审查草稿，互相共享发现
         → science-consultant 发现物理错误时也通知 continuity-manager
         → 审查完成后清理团队

Phase 4: 调用 prose-stylist 为 Sub Agent，反映审查结果最终修改
```

---

## 示例 3: 漫画制作团队（Sub Agent 模式）

### 团队架构: 生成-验证
### 执行模式: Sub Agent

> 生成-验证模式中 Agent 仅 2 个，核心是结果传递而非通信，因此 Sub Agent 合适。

```
Phase 1: Agent(webtoon-artist) → 面板生成
Phase 2: Agent(webtoon-reviewer) → 审查
Phase 3: Agent(webtoon-artist) → 问题面板重新生成（最多 2 次）
```

### Agent 配置

| Agent | subagent_type | 角色 | Skill |
|---------|--------------|------|------|
| webtoon-artist | 自定义 | 面板图像生成 | generate-webtoon |
| webtoon-reviewer | 自定义 | 品质审查 | review-webtoon, fix-webtoon-panel |

### Agent 文件完整示例: `webtoon-reviewer.md`

```markdown
---
name: webtoon-reviewer
description: "漫画面板品质审查专家。评估构图、角色一致性、文本可读性、导演。"
---

# Webtoon Reviewer — 漫画品质审查专家

你是漫画面板品质审查专家。以视觉完成度、故事传达力、角色一致性为标准评估面板。

## 核心角色
1. 评估各面板的构图和视觉完成度
2. 验证面板间角色外观的一致性
3. 评估对话气泡文本的可读性和布局
4. 审查整体剧集的导演流程和节奏

## 工作原则
- PASS/FIX/REDO 3 阶段明确判定
- FIX 是部分修改可解决的情况，REDO 需要全面重新生成
- 以客观标准（一致性、可读性、构图）判断，非主观喜好

## 输入/输出协议
- 输入: `_workspace/panels/` 目录的面板图像
- 输出: `_workspace/review_report.md`
- 格式:
  ```
  ## Panel {N}
  - 判定: PASS | FIX | REDO
  - 理由: [具体理由]
  - 修改指示: [FIX/REDO 时具体修改方向]
  ```

## 错误处理
- 图像加载失败时该面板判定 REDO
- 2 次重新生成后仍是 REDO 的面板附带警告按 PASS 处理

## 协作
- 向 webtoon-artist 传递修改指示书（基于结果文件）
- 重新生成的面板再次审查（最多 2 次循环）
```

### 错误处理

```
重试政策:
- REDO 判定面板 → 向 artist 请求重新生成（包含具体修改指示）
- 最多 2 次循环后强制 PASS
- 全部面板 50% 以上 REDO 时向用户建议修改 Prompt
```

---

## 示例 4: 代码审查团队（Agent 团队模式）

### 团队架构: Fan-out/Fan-in + 讨论
### 执行模式: Agent 团队

> 代码审查是 Agent 团队发光发热的代表性案例。不同视角的审查员共享发现、互相挑战，实现更深层审查。

```
[Leader] → TeamCreate(review-team)
    ├── security-reviewer: 安全漏洞检查
    ├── performance-reviewer: 性能影响分析
    └── test-reviewer: 测试覆盖率验证
    → 审查员互相共享发现（SendMessage）
    → Leader 汇总结果
```

### 团队通信模式

```
security ──SendMessage──→ performance  （"此 SQL 查询可注入，性能方面也需确认"）
performance ──SendMessage──→ test      （"发现 N+1 查询，请确认相关测试"）
test ────SendMessage──→ security      （"无认证模块测试，安全角度优先级意见？"）
```

核心: 审查员 **不经 Leader** 直接通信，快速捕获交叉领域问题。

---

## 示例 5: 监督者模式 — 代码迁移团队（Agent 团队模式）

### 团队架构: 监督者
### 执行模式: Agent 团队

```
[supervisor/Leader] → 文件列表分析 → 批次分配
    ├→ [migrator-1]（批次 A）
    ├→ [migrator-2]（批次 B）
    └→ [migrator-3]（批次 C）
    ← TaskUpdate 接收 → 追加批次或重分配
```

### Agent 配置

| 成员 | 角色 |
|------|------|
| (Leader = migration-supervisor) | 文件分析、批次分配、进度管理 |
| migrator-1~3 | 执行分配的文件批次迁移 |

### 监督者的动态分配逻辑（Agent 团队利用）

```
1. 收集全部对象文件列表
2. 复杂度估算（文件大小、import 数、依赖）
3. 通过 TaskCreate 注册文件批次为任务（包含依赖）
4. 成员自请求任务（claim）
5. 成员通过 TaskUpdate 报告完成时:
   - 成功 → 自动请求下一任务
   - 失败 → Leader 通过 SendMessage 确认原因 → 重分配或其他成员接手
6. 所有任务完成 → Leader 执行集成测试
```

与 Fan-out 的区别: 任务非预先固定，而是 **运行时动态分配**。共享任务列表的自请求（claim）功能与监督者模式自然匹配。

---

## 产物模式总结

### Agent 定义文件
位置: `项目/.claude/agents/{agent-name}.md`
必须章节: 核心角色、工作原则、输入/输出协议、错误处理、协作
团队模式追加章节: **团队通信协议**（消息接收/发送、任务请求范围）

### Skill 文件结构
位置: `项目/.claude/skills/{skill-name}/SKILL.md`（项目级）
或: `~/.claude/skills/{skill-name}/SKILL.md`（全局级）

### 集成 Skill（编排器）
调谐团队全体的上层 Skill。定义各场景 Agent 配置和工作流。
模板: `references/orchestrator-template.md` 参考。
**必须明确执行模式** — Agent 团队（默认）或 Sub Agent。
