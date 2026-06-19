# Handoff: Codex Desktop 对标 — Phase 1 + Phase 2 完成

## Session Metadata
- Created: 2026-06-19 19:41
- Project: /Users/liuyongze/Documents/AI-agent
- Branch: main
- Last commit: `0f399ee` feat: Phase 1+2 — multi-thread, review panel, skills system

### Recent Commits
  - `0f399ee` feat: Phase 1+2 — multi-thread, review panel, skills system (THIS SESSION)
  - `857bd12` fix: 修复后端 LangChain4j 0.36.2 兼容性与 lombok 依赖缺失问题

## Current State Summary

完成了对标 Codex Desktop 的 Phase 1（多线程架构 + Agent Tool 自动执行链路）和 Phase 2（Review Panel Diff 审查面板 + Skills 技能系统）。项目从"单会话聊天壳"演进为支持多线程并行、Agent 自动执行命令、Diff 可视化审查、技能发现与执行的桌面客户端。

编译验证全部通过（Desktop TypeScript + Backend Java）。已合并到 main 并推送到远程。

## Codebase Understanding

### Architecture Overview

```
desktop/
├── src/main/                         ← Electron 主进程
│   ├── thread-manager.ts             ← NEW: 多线程管理
│   ├── worktree-manager.ts           ← NEW: Git Worktree 隔离
│   ├── pty-pool.ts                   ← NEW: 多终端池（替代 PtyManager）
│   ├── approval-engine.ts            ← NEW: 三层审批策略
│   ├── tool-execution-bridge.ts      ← NEW: Agent Tool 自动执行桥
│   ├── skill-manager.ts              ← NEW: Skill 发现/解析/管理
│   ├── diff-parse.ts                 ← NEW: unified diff 结构化解析
│   ├── git-manager.ts                ← 增强：stageHunk/revertHunk/commit/push/PR
│   ├── index.ts                      ← 修改：初始化新 Manager
│   └── ipc-registry.ts              ← 修改：thread/* / tool/* / review/* / skill/*
├── src/preload/index.ts              ← 修改：暴露全部新 API
└── src/renderer/src/
    ├── components/layout/
    │   ├── MainLayout.tsx            ← 修改：三面板切换
    │   └── ThreadTabs.tsx            ← NEW: 底部终端 Tab 栏
    ├── components/review/            ← NEW: Diff 审查面板
    │   └── ReviewPanel.tsx + 4 子组件
    └── components/skills/            ← NEW: 技能浏览器
        └── SkillsPanel.tsx + 2 子组件

backend/src/main/java/.../tooling/
└── AgentToolOrchestrator.java        ← 修改：runSkill tool + ~/.codex/skills/ 支持
```

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `desktop/src/main/thread-manager.ts` | 多线程生命周期管理 | 核心：每个 Thread = Worktree + 终端 + Session |
| `desktop/src/main/tool-execution-bridge.ts` | Agent Tool 自动执行 | 核心：打通后端 tool_call → 本地执行 → 结果回传 |
| `desktop/src/main/approval-engine.ts` | 三层审批策略 | core: suggest/auto-edit/full-auto + 规则引擎 |
| `desktop/src/main/git-manager.ts` | Git 操作 | 核心：structuredDiff / stageHunk / commit / push / PR |
| `desktop/src/main/skill-manager.ts` | Skill 发现管理 | 核心：SKILL.md 解析 + 三级扫描路径 |
| `desktop/src/main/ipc-registry.ts` | IPC 注册中心 | 所有 IPC handler 汇总 |
| `docs/arch/001-codex-desktop-alignment.md` | Phase 1 设计文档 | 完整架构蓝图 |
| `docs/arch/002-phase2-review-skills-plan.md` | Phase 2 计划 | Track A+B 详细设计 |
| `docs/arch/003-phase3-computer-use-automations-plan.md` | Phase 3 计划 | Computer Use + Automations 规划 |

## Work Completed

### Tasks Finished

- [x] 设计文档：3 份（Phase 1 架构 + Phase 2 计划 + Phase 3 计划）
- [x] Phase 1：ThreadManager + WorktreeManager + PtyPool（多线程基础设施）
- [x] Phase 1：ToolExecutionBridge + ApprovalEngine（Agent 工具链路）
- [x] Phase 1：IPC + Preload + MainLayout + ThreadTabs（UI 集成）
- [x] Phase 2A：diff-parse + GitManager stage/revert/commit/push/PR 增强
- [x] Phase 2A：DiffLine + DiffHunkView + DiffViewer + ReviewPanel + review.css
- [x] Phase 2A：review:* IPC + MainLayout 集成
- [x] Phase 2B：SkillManager（YAML 解析 + 三级扫描 + 工具注册）
- [x] Phase 2B：skill:* IPC + SkillsPanel + SkillDetail + skills.css
- [x] Phase 2B：Backend AgentToolOrchestrator runSkill + ~/.codex/skills/ 支持
- [x] 编译验证（TS main + renderer + Java Maven）
- [x] 合并 main + 推送到远程 GitHub

### New Files Created (18 files)

```
desktop/src/main/
├── thread-manager.ts        (360 lines)
├── worktree-manager.ts      (149 lines)
├── pty-pool.ts              (193 lines)
├── approval-engine.ts       (190 lines)
├── tool-execution-bridge.ts (391 lines)
├── skill-manager.ts         (384 lines)
├── diff-parse.ts            (227 lines)

desktop/src/renderer/src/components/layout/
└── ThreadTabs.tsx           (100 lines)

desktop/src/renderer/src/components/review/
├── ReviewPanel.tsx          (343 lines)
├── DiffViewer.tsx           (71 lines)
├── DiffHunkView.tsx         (83 lines)
├── DiffLine.tsx             (69 lines)
└── review.css               (412 lines)

desktop/src/renderer/src/components/skills/
├── SkillsPanel.tsx          (157 lines)
├── SkillDetail.tsx          (109 lines)
└── skills.css               (368 lines)

desktop/resources/skills/example-skill/
└── SKILL.md                 (39 lines)

docs/arch/
├── 001-codex-desktop-alignment.md      (873 lines)
├── 002-phase2-review-skills-plan.md    (385 lines)
└── 003-phase3-computer-use-automations-plan.md (new, planning)
```

### Modified Files (5 files)

| File | Changes |
|------|---------|
| `desktop/src/main/index.ts` | PtyManager→PtyPool，新增 ThreadManager/ToolBridge/SkillManager |
| `desktop/src/main/ipc-registry.ts` | thread/* / tool/* / approval/* / review/* / skill/* handler |
| `desktop/src/preload/index.ts` | 暴露 thread.* / tool.* / review.* / skill.* API |
| `desktop/src/renderer/src/components/layout/MainLayout.tsx` | 三面板切换（上下文/审查/技能）+ Thread 列表 |
| `desktop/src/renderer/src/index.css` | ThreadTabs + review toggle + sidebar-item 样式 |
| `backend/.../tooling/AgentToolOrchestrator.java` | runSkill tool + ~/.codex/skills/ 扫描 + 参数传递 |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Thread 创建自动 `git worktree add -b codex/<name>` | 对标 Codex 做法，每个 Agent 独立隔离分支 |
| 审批策略默认 auto-edit | 文件编辑自动执行，CLI 命令需确认，兼顾效率与安全 |
| 终端 UI 底部单栏 + Tab 切换 | 对标 Codex Desktop 布局，一个 Thread 一个终端 |
| PtyManager→PtyPool 重构 | 单例→多实例，每个 Thread 独立 shell 会话 |
| Skill 三级扫描路径（全局→项目→工作区） | Codex 的 AGENTS.md 分层发现模式 |
| YAML frontmatter 自研解析器 | 避免额外依赖，SKILL.md 格式与 .agents/skills/ 现有格式兼容 |

## Pending Work

## Immediate Next Steps

1. **Phase 3 Track A: Computer Use** — macOS CGEvent + CGDisplay 截图→操作循环（用户明确要求过）
2. **Phase 3 Track B: Automations** — cron 定时 + Skill 执行 + Review Queue
3. **内嵌 WebView 浏览器** — Electron `<webview>` 或 BrowserView API

### Deferred Items

- Skills 后端 AgentToolOrchestrator 深度集成（当前 runSkill 走 Simple Tool Output，后续可改为注入 system prompt）
- 沙箱集成（macOS Seatbelt profile 注入）
- Computer Use Swift 脚本（需 macOS 权限测试）
- 旧 PtyManager 清理（已替换为 PtyPool，文件保留未删除）

## Context for Resuming Agent

## Important Context

用户叫"泽宝"，AI 搭档叫"开心"。大学生，研究方向 AI + Java。

项目是一个 AI 编程助手桌面客户端（Electron + Spring Boot），对标 OpenAI Codex Desktop。核心设计文档在 `docs/arch/001-codex-desktop-alignment.md`。

**当前技术状态：**
- 桌面端 TypeScript 主进程 + React 渲染进程，编译通过 ✅
- 后端 Java 微服务（Maven 多模块），Maven 编译通过 ✅
- 设计文档已包含 Phase 3 Computer Use 方案（使用 macOS CGEvent/CGDisplay）
- Git 分支 `main`，最新 commit `0f399ee`，已推送远程

**Phase 3 起点：** 见 `docs/arch/003-phase3-computer-use-automations-plan.md`。Computer Use 需要先创建 `desktop/scripts/` 下的 Swift 脚本（cu-screenshot.swift, cu-click.swift, cu-type.swift），然后实现 `ComputerUseManager`。

### Assumptions Made

- Thread 的 Worktree 模式只在创建时自动建分支，不自动清理 archived thread
- 审批策略目前是硬编码规则列表，未实现从 config 文件加载
- Skill 扫描路径在 `MainLayout` 的 `useEffect` 中更新，依赖 workspacePath 变化

### Potential Gotchas

- 旧 `pty-manager.ts` 仍存在于磁盘但未被引用，可安全删除
- `ContextPanel.tsx` 硬编码了 `http://127.0.0.1:8765` 连 local-service，应改为从 IPC 获取端口
- `pom.xml` 有未提交的改动（`M pom.xml` 来自另一个任务）
- 网络环境可能不稳定（推送曾因 SSL 失败，重试后成功）

## Related Resources

- `docs/arch/001-codex-desktop-alignment.md` — 完整架构蓝图
- `docs/arch/002-phase2-review-skills-plan.md` — Phase 2 详细设计
- `docs/arch/003-phase3-computer-use-automations-plan.md` — Phase 3 计划
- `MEMORY.md` — 项目记忆索引
- `.claude/projects/` — 项目记忆目录

---

**恢复方法：** 在 Claude Code 中说「继续之前的 Codex Desktop 项目」，或者引用 handoff 文件路径。
