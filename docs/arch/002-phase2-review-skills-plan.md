# Phase 2 落地计划：Review Panel + Skills 系统

> 版本：v0.1 | 日期：2026-06-19 | 状态：规划
> 前置依赖：Phase 1（ThreadManager + PlyPool + ToolBridge + ApprovalEngine）已完成

---

## 概述

Phase 2 解决两大体验差距：**代码审查可视化** 和 **Agent 能力扩展**。

```
Phase 2
├── Track A: Review Panel（Diff 可视化审查）
│   ├── A1: Git diff 数据管道
│   ├── A2: Diff 渲染组件
│   ├── A3: 逐块 stage / revert
│   ├── A4: 行内评论
│   └── A5: Commit / Push / PR
│
└── Track B: Skills 系统
    ├── B1: Skill 定义规范 + 文件发现
    ├── B2: SkillManager（IPC 注册+执行）
    ├── B3: Skills 浏览器 UI
    └── B4: Skill Editor（可选）
```

两条 Track **无强依赖** 关系，可并行或按任意顺序推进。

---

## Track A — Review Panel

### A1: Git diff 数据管道

**现状**：`GitManager.getDiff()` 已返回原始 diff 字符串，`GitManager.getStatus()` 已返回文件状态列表。

**需要新增**：

```typescript
// GitManager 新增方法
class GitManager {
  // 获取结构化 diff 数据
  async getStructuredDiff(projectPath: string, options?: {
    baseRef?: string          // 基准分支，默认 HEAD
    lastTurn?: boolean        // 仅上次 AI 改动的部分（通过 worktree diff 或 commit 标记）
    fileFilter?: string[]     // 仅特定文件
  }): Promise<StructuredDiff[]>

  // 暂存指定 hunk
  async stageHunk(projectPath: string, file: string, startLine: number, endLine: number): Promise<boolean>

  // 还原指定 hunk
  async revertHunk(projectPath: string, file: string, startLine: number, endLine: number): Promise<boolean>

  // 暂存整个文件
  async stageFile(projectPath: string, file: string): Promise<boolean>

  // 还原整个文件
  async revertFile(projectPath: string, file: string): Promise<boolean>

  // 提交
  async commit(projectPath: string, message: string): Promise<{ success: boolean; commitHash?: string }>

  // 推送
  async push(projectPath: string): Promise<boolean>

  // 创建 PR（通过 gh CLI）
  async createPullRequest(projectPath: string, options: {
    title: string
    body?: string
    base?: string
  }): Promise<{ url?: string; success: boolean }>
}
```

**数据结构**：

```typescript
interface StructuredDiff {
  file: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  hunks: DiffHunk[]
}

interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string           // e.g. @@ -12,7 +12,8 @@
  lines: DiffLine[]
}

interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  oldLineNo: number | null
  newLineNo: number | null
  content: string
}
```

**实现方式**：解析 `git diff` 的 unified format 输出（或直接调用 `git diff --no-color --unified=3` 后做行级解析）。

### A2: Diff 渲染组件

**新建文件**：

```
renderer/src/components/review/
  ├── DiffViewer.tsx         ← 单个文件 diff 渲染
  ├── DiffHunkView.tsx       ← 单个 hunk 渲染
  ├── DiffLine.tsx           ← 单行渲染（带行号 + +/- 标记）
  ├── ReviewPanel.tsx        ← 右侧面板容器，文件列表 → 选择 → 展示 diff
  ├── CommitDialog.tsx       ← 提交对话框（输入 commit message）
  └── review.css             ← 样式
```

**布局**：

```
┌─────────────────────────────────────────────────┐
│  Review Panel                    [Commit] [Push] │
├─────────────────────────────────────────────────┤
│  文件列表     │  Diff 视图                       │
│  ┌──────────┐ │  ┌─────────────────────────────┐│
│  │ ☐ src/   │ │  │ @@ -12,7 +12,8 @@          ││
│  │   main.ts│ │  │  - old code                  ││
│  │ ☐ src/   │ │  │  + new code          [Stage]││
│  │   util.ts│ │  │  @@ -45,5 +46,9 @@         ││
│  │          │ │  │  - old                       ││
│  └──────────┘ │  │  + new              [Revert]││
│               │  └─────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**交互**：
- 点击文件 → 右侧展示该文件 diff
- hunk 右侧 [Stage] / [Revert] 按钮
- 行号悬停 → "+" 按钮 → 输入行内评论
- 顶部 [Commit] 按钮 → 弹出 CommitDialog

### A3: IPC 接口

```
review:get-diff            invoke → StructuredDiff[]
review:get-file-diff       invoke → StructuredDiff (single file)
review:stage-hunk          invoke → boolean
review:revert-hunk         invoke → boolean
review:stage-file          invoke → boolean
review:revert-file         invoke → boolean
review:commit              invoke → { commitHash }
review:push                invoke → boolean
review:create-pr           invoke → { url }
review:add-comment         invoke → boolean  (inline comment)
```

### A4: Diff 样式参考

参考 Codex 的 diff 着色方案：
- 新增行：绿色背景（`#22c55e` 透明度 15%）+ 绿色行号
- 删除行：红色背景（`#ef4444` 透明度 15%）+ 红色行号
- 上下文行：灰色
- 行号：右侧对齐的等宽字体，灰色

---

## Track B — Skills 系统

### B1: Skill 定义规范

**格式**（参考现有 `.agents/skills/` 和 Codex 的 Skill 格式）：

```markdown
---
name: my-skill
description: 这是一个自定义技能
version: 1.0.0
author: user
triggers:
  - "@my-skill"
  - "run my-skill"
tags:
  - coding
  - spring
tools:        # 可选：技能注册的额外工具
  - name: my_tool
    description: "自定义工具描述"
    input_schema:
      type: object
      properties:
        param1:
          type: string
          description: "参数说明"
---

# Skill 指令

这里是 Markdown 格式的指令，Agent 在触发时读取。

## 步骤

1. 第一步做什么
2. 第二步做什么
3. ...

## 验证

- 运行什么命令确认结果
- 检查什么文件
```

**目录布局**：

```
~/.codex/skills/              ← 全局技能
  my-skill/
    SKILL.md                  ← 指令文件（必须）
    scripts/                  ← 可选脚本
      setup.sh
    references/               ← 可选参考文档
      example.md

<project>/.agents/skills/     ← 项目级技能（已有部分）
  cc-bugfix-jpa-lazy-init/
    SKILL.md

<workspace>/   ← 工作区级技能（未来）
```

**发现优先级**：工作区级 > 项目级 > 全局（同名时覆盖）。

### B2: SkillManager

**位置**：`desktop/src/main/skill-manager.ts`

```typescript
interface Skill {
  name: string
  description: string
  version?: string
  author?: string
  triggers?: string[]
  tags?: string[]
  tools?: SkillToolDef[]
  basePath: string           // SKILL.md 所在目录
  readme?: string            // SKILL.md 内容
  hasScripts: boolean
  hasReferences: boolean
}

interface SkillToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

class SkillManager {
  private scanPaths: string[]

  constructor(scanPaths?: string[])

  /** 全量发现：扫描所有路径 */
  discoverSkills(): Promise<Skill[]>

  /** 按名称查找 */
  getSkill(name: string): Promise<Skill | null>

  /** 读取 SKILL.md 内容 */
  readSkill(skill: Skill): Promise<string>

  /** 注册技能的 tools 到 AgentToolOrchestrator */
  registerTools(skill: Skill): Promise<void>

  /** 列出可用技能 */
  listSkills(): Promise<Skill[]>

  /** 安装技能（从 Git 仓库或本地目录复制） */
  installSkill(source: string): Promise<Skill>
}
```

### B3: Skills 后端集成

在 `backend` 的 `AgentToolOrchestrator` 中增强 `executeDynamicSkill()`：

```
Agent 调用 "run-skill" tool
  │
  ▼
AgentToolOrchestrator 发现 tool name 以 "skill:" 开头
  │
  ├─ → 将 SKILL.md 内容注入 system prompt 作为指令
  └─ → 注入 skill 的 tools 到 tool definitions
  │
  ▼
Agent 重新推理，这次有了 skill 提供的上下文和工具
```

### B4: IPC 接口

```
skill:list              invoke → Skill[]
skill:get               invoke → Skill | null
skill:read              invoke → string (SKILL.md 内容)
skill:install           invoke → Skill (从路径安装)
skill:refresh           invoke → void (重新扫描)
```

### B5: Skills 浏览器 UI

**新建文件**：

```
renderer/src/components/skills/
  ├── SkillsPanel.tsx     ← 技能浏览/安装面板
  ├── SkillCard.tsx       ← 单技能卡片
  └── SkillDetail.tsx     ← 技能详情页
```

**布局**：

```
┌─────────────────────────────────────┐
│  技能              [搜索] [刷新]    │
├─────────────────────────────────────┤
│  ┌─ 全局技能 ─────────────────────┐ │
│  │ My Skill    ✓ 已安装           │ │
│  │ 描述：这是一个自定义技能        │ │
│  │ [查看] [卸载]                  │ │
│  ├────────────────────────────────┤ │
│  │ Code Review  ✓ 已安装          │ │
│  │ 描述：代码审查技能             │ │
│  │ [查看] [卸载]                  │ │
│  ├────────────────────────────────┤ │
│  │ 项目技能                       │ │
│  │ cc-bugfix-jpa-lazy-init       │ │
│  │ [查看]                         │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 工作量估算

| 任务 | 文件数 | 预估工时 | 依赖 |
|------|--------|---------|------|
| A1: Git diff 数据管道 | 2（GitManager + parser） | 2-3h | 无 |
| A2: Diff 渲染组件 | 5 个组件 + 1 个 CSS | 4-6h | A1 |
| A3: IPC + Preload + 集成 | 3（ipc-registry, preload, MainLayout） | 1-2h | A2 |
| A4: 行内评论 | 2（组件 + backend 存储） | 2-3h | A2 |
| A5: Commit/Push/PR | 2（GitManager + 对话框） | 2h | A2 |
| **Track A 合计** | **~15 个** | **11-16h** | |
| B1-B2: SkillManager | 2（manager + parser） | 2-3h | 无 |
| B3: 后端集成 | 1（AgentToolOrchestrator 增强） | 1-2h | B1 |
| B4: IPC + UI | 4（IPC + preload + 2 UI 组件） | 2-3h | B2 |
| **Track B 合计** | **~9 个** | **5-8h** | |

**总预估：16-24h（约 2-3 天）**

两条 Track 可以并行推进，也可以只选一条先做。

---

## 前置依赖检查

- [x] Phase 1: ThreadManager + PtyPool
- [x] Phase 1: ToolExecutionBridge
- [x] Phase 1: ApprovalEngine
- [x] GitManager 基础操作（getDiff, getStatus, checkout 等）
- [x] local-service 文件读取
- [ ] ~~AgentToolOrchestrator Dynamic Skill~~（B3 时做，不阻塞）

---

## 测试要点

| 测试项 | 方法 |
|--------|------|
| Diff 解析正确性 | 对有 staged/unstaged/untracked 混合状态的仓库测试 |
| Stage/Revert 安全性 | 确认操作后 `git status` 符合预期 |
| 行内评论持久化 | 评论存储为独立文件或嵌入 git notes |
| Skill 发现路径 | 测试 ~/.codex/skills/ 和 .agents/skills/ 同时存在时的优先级 |
| Skill 工具注册 | 确认 Agent 能正确调用 skill 注册的额外工具 |
