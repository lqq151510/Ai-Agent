# 对标 Codex Desktop 架构设计文档

> 版本：v0.1 | 日期：2026-06-19 | 状态：草稿

---

## 目录

1. [现状与目标](#1-现状与目标)
2. [目标架构全景](#2-目标架构全景)
3. [Phase 1：多线程 + Agent Tool 链路](#3-phase-1多线程--agent-tool-链路)
4. [Phase 2：体验对齐](#4-phase-2体验对齐)
5. [Phase 3：扩展功能](#5-phase-3扩展功能)
6. [数据流与接口设计](#6-数据流与接口设计)
7. [现有代码复用清单](#7-现有代码复用清单)
8. [附录：Codex Desktop 能力对照表](#8-附录codex-desktop-能力对照表)

---

## 1. 现状与目标

### 1.1 当前架构（简化）

```
┌─────────────────────────────────────────────────┐
│  Renderer (React, Vite)                          │
│  └─ MainLayout (单一会话)                        │
│       ├─ SessionList (左栏)                      │
│       ├─ ChatArea (中栏，含一个终端)             │
│       └─ ContextPanel (右栏，文件树)             │
├────────────────── IPC ─────────────────────────┤
│  Electron Main Process                          │
│  ├─ BackendManager (Java 进程)                  │
│  ├─ PtyManager (1 个终端)                       │
│  ├─ ChatManager (单会话存储)                    │
│  ├─ WorkspaceManager (单项目)                   │
│  ├─ GitManager (shell)                          │
│  └─ LocalServiceManager (Express 子进程)        │
├────────────────── HTTP ─────────────────────────┤
│  Backend (Spring Boot)                          │
│  ├─ AgentService (agent loop)                   │
│  ├─ ToolCallManager + AgentToolOrchestrator     │
│  └─ 5 模块 Agent Pipeline (Kafka)              │
└─────────────────────────────────────────────────┘
```

### 1.2 目标架构（Codex Desktop 对齐）

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (React, Vite)                                 │
│  ├─ Sidebar (项目列表 + Thread 列表 + Automations)      │
│  ├─ ThreadView (当前 Thread 的完整工作区)               │
│  │   ├─ Chat/Agent Output (流式输出 + 工具调用展示)     │
│  │   ├─ Terminal (每个 Thread 独立终端)                 │
│  │   ├─ Diff Review Panel (逐块审查/提交)               │
│  │   └─ Inline Code Review (内联注释)                   │
│  ├─ RightPanel (文件树 / 浏览器 / 侧聊)                │
│  └─ ApprovalDialog (审批策略 UI)                        │
├────────────────── IPC + contextBridge ──────────────────┤
│  Electron Main Process                                  │
│  ├─ ThreadManager     ← NEW: 多线程生命周期管理         │
│  ├─ WorktreeManager   ← NEW: Git Worktree 隔离          │
│  ├─ BackendManager    ← 增强: 多后端实例                │
│  ├─ PtyManager        ← 增强: 多终端池                  │
│  ├─ SessionManager    ← 从 ChatManager 升级             │
│  ├─ WorkspaceManager  ← 增强: 多项目+项目配置           │
│  ├─ GitManager        ← 增强: 更多操作                  │
│  ├─ SandboxManager    ← NEW: 权限策略引擎               │
│  ├─ SkillManager      ← NEW: Skills 发现/执行           │
│  ├─ BrowserManager    ← NEW: 内嵌 WebView               │
│  ├─ AutomationManager ← NEW: 定时任务调度                │
│  └─ LocalServiceManager                                 │
├────────────────── HTTP / Kafka ──────────────────────────┤
│  Backend (Spring Boot)                                  │
│  ├─ AgentService (agent loop, 增强工具集)               │
│  │   ├─ Desktop Tool Bridge ← NEW: pty/file 暴露为工具  │
│  │   └─ Skill Executor     ← NEW: 执行 Skill 指令包     │
│  ├─ ToolCallManager + AgentToolOrchestrator (已有)       │
│  ├─ 5 模块 Agent Pipeline (Kafka, 已有)                 │
│  └─ Sandbox Policy Service ← NEW: 策略 API              │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 目标架构全景

### 2.1 核心概念映射

| Codex Desktop | 你的项目 | 差距 |
|---------------|---------|------|
| **Thread**（线程） | ChatManager 单会话 | 无多线程模型 |
| **Worktree**（工作树） | 无 | 无 Git 隔离 |
| **Project**（项目） | WorkspaceManager | 功能对齐，需增强 |
| **Agent Loop** | AgentService + FlexAgent | 已有，比 Codex 还成熟 |
| **Tool**（execute_cli_command 等） | AgentToolOrchestrator | 已有 5 个内置工具 |
| **MCP Server** | 无 | 需引入 |
| **Sandbox** | 无 | 需新建 |
| **Approval Policy** | 只有 UI mock | 需新建策略引擎 |
| **Skills** | 无 | 需新建 |
| **Automations** | 无 | 需新建 |
| **Review Panel** | 无 | 需新建 |
| **Terminal per Thread** | PtyManager 单例 | 需多终端池 |

### 2.2 你的项目独特优势

你的后端已经实现了 **比 Codex CLI 更完善的 Agent Pipeline**（5 模块 Kafka 微服务：gateway → router → retrieval → generation → reflection），这是 Codex Desktop 没有的**多 Agent 编排能力**。设计时应保留并利用。

---

## 3. Phase 1：多线程 + Agent Tool 链路

**目标**：解决核心架构缺陷，让"一个项目可以开 N 个 Agent 同时干活"

### 3.1 ThreadManager（新增）

**位置**：`desktop/src/main/thread-manager.ts`

**核心职责**：管理多个 Agent 线程的生命周期，每个 Thread = Worktree + Terminal + Session + 独立后端路由。

```typescript
interface Thread {
  id: string
  name: string
  status: 'idle' | 'running' | 'blocked' | 'error' | 'done'
  projectPath: string
  worktreePath: string | null       // Git worktree 路径，null 表示 local 模式
  sessionId: string                  // 后端 Session ID
  terminalId: string                 // PtyManager 中的终端 ID
  createdAt: number
  updatedAt: number
  branch: string
  mode: 'local' | 'worktree' | 'cloud'
}
```

**接口**：
```typescript
class ThreadManager {
  createThread(projectPath: string, name: string, mode: ThreadMode): Promise<Thread>
  getThread(id: string): Thread | null
  listThreads(projectPath?: string): Thread[]
  archiveThread(id: string): Promise<void>
  switchThread(id: string): void       // 切换当前活跃 Thread
  getActiveThread(): Thread | null
  closeThread(id: string): Promise<void>  // 清理 worktree + 终端
}
```

**实现要点**：
- `createThread` 时：创建 Backend Session → 可选创建 Git Worktree → 分配终端 → 持久化 Thread 元信息
- Thread 元数据存储在 `dataDir/threads/<threadId>.json`（参考现有 `ChatManager` 的模式）
- 多线程间的状态通过 `activeThreadId` 切换，渲染层只展示当前活跃线程

### 3.2 WorktreeManager（新增）

**位置**：`desktop/src/main/worktree-manager.ts`

```typescript
class WorktreeManager {
  createWorktree(projectPath: string, branch: string): Promise<{ path: string; branch: string }>
  removeWorktree(projectPath: string, worktreePath: string): Promise<void>
  listWorktrees(projectPath: string): Promise<{ path: string; branch: string }[]>
  pruneWorktrees(projectPath: string): Promise<void>
  hasUncommittedChanges(projectPath: string): Promise<boolean>
}
```

**实现说明**：
- 用 `git worktree add <path> <branch>` 创建隔离副本
- worktree 路径统一放在 `dataDir/worktrees/<project-hash>/<thread-id>/`
- `removeWorktree` 用 `git worktree remove` 清理，失败则 `rm -rf`
- 参考 Codex：active worktree 保留，archived worktree 自动清理

### 3.3 PtyManager 升级为多终端（修改）

**现状**：`PtyManager` 是单例，一次一个终端。

**改造目标**：`PtyPool` 管理 N 个终端实例，每个 Thread 绑定一个。

```typescript
interface PtyInstance {
  id: string
  process: pty.IPty
  cwd: string
  threadId: string
}

class PtyPool {
  private instances: Map<string, PtyInstance> = new Map()

  spawn(threadId: string, cwd: string): string    // 返回 terminalId
  write(terminalId: string, data: string): void
  resize(terminalId: string, cols: number, rows: number): void
  onData(terminalId: string, callback: (data: string) => void): void
  kill(terminalId: string): void
  killAll(): void
}
```

### 3.4 Thread 与终端的多对一关系图

```
ThreadManager
  ├─ Thread A (feature/db-refactor)
  │    ├─ Worktree: dataDir/worktrees/ai-agent/thread-a/
  │    ├─ Terminal: PtyPool[A]
  │    └─ Session: backend session-xxx
  │
  ├─ Thread B (fix/unit-tests)
  │    ├─ Worktree: dataDir/worktrees/ai-agent/thread-b/
  │    ├─ Terminal: PtyPool[B]
  │    └─ Session: backend session-yyy
  │
  └─ Thread C (refactor/config)
       ├─ Worktree: (none, local mode)
       ├─ Terminal: PtyPool[C]
       └─ Session: backend session-zzz
```

### 3.5 Agent Tool 链路打通（核心改动）

**现状**：Agent 的 `execute_cli_command` 走的是 `ClientToolRegistry` 模式——后端输出 tool_call → SSE 发给前端 → 前端执行 → POST `/tool_result` 回后端。

**问题**：前端收到 tool_call 后，**没有实际执行**（现在走的 mock 链路）。

**改造**：在 IPC 层创建 `ToolExecutionBridge`，自动执行桌面端工具并返回结果。

#### 3.5.1 工具执行链路（改造后）

```
Backend AgentService
  │  Agent 决定调用 execute_cli_command
  │
  ▼
AgentToolOrchestrator.execute(toolCall)
  │  ClientToolRegistry 创建 CompletableFuture
  │
  ▼
SSE event: client_tool_call
  │  { toolCallId, toolName: "execute_cli_command", args: { command: "npm test" } }
  │
  ▼
IPC → Renderer (chat:stream-event, type: client_tool_call)
  │
  ├─ Auto-mode: ToolExecutionBridge 自动处理
  │    │
  │    ▼
  │  PtyPool[threadId].write(command + "\n")
  │    │  等待命令完成（通过 $? 标记或超时）
  │    ▼
  │  收集 stdout/stderr
  │    │
  │    ▼
  │  POST /api/v1/agent/chat/tool_result  ← 自动回传
  │    │
  │    ▼
  │  Backend 继续 agent loop
  │
  └─ Manual-mode: 弹审批对话框
       │  用户确认 → 同上链路
       └  用户拒绝 → POST tool_result 返回 "rejected by user"
```

#### 3.5.2 ToolExecutionBridge（新增）

**位置**：`desktop/src/main/tool-execution-bridge.ts`

```typescript
class ToolExecutionBridge {
  constructor(
    private ptyPool: PtyPool,
    private localServicePort: () => number,
    private backendPort: () => number,
    private authToken: () => string,
  )

  /**
   * 自动执行一个工具调用
   * 由 `chat:send-with-context` 的 SSE 流触发
   */
  async execute(toolCall: {
    toolCallId: string
    toolName: string
    args: Record<string, any>
    threadId: string
    approvalMode: ApprovalMode
  }): Promise<ToolResult>

  /**
   * 执行 CLI 命令并收集输出
   * 通过写入终端 + 捕获输出的方式
   */
  private async executeCli(
    command: string, 
    threadId: string, 
    timeoutMs: number
  ): Promise<string>

  /**
   * 读取文件内容（通过 local-service）
   */
  private async readFile(filePath: string): Promise<string>

  /**
   * 将结果回传给后端
   */
  private async submitResult(toolCallId: string, result: string): Promise<void>
}
```

#### 3.5.3 自动执行策略（ApprovalMode）

```typescript
type ApprovalMode = 
  | 'suggest'    // 所有操作都先问用户（Codex Suggest 模式）
  | 'auto-edit'  // 文件编辑自动执行，CLI 命令需确认（类似 Codex Auto-Edit）
  | 'full-auto'  // 完全自动，只记录审计日志（类似 Codex Full Auto）
```

**现有组件复用**：
- `PlanApprovalDialog.tsx` 可改造为通用的审批对话框
- `context-panel 中 serviceReady 逻辑` 可复用

### 3.6 Phase 1 需要修改的文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `desktop/src/main/thread-manager.ts` | **新建** | 多线程管理 |
| `desktop/src/main/worktree-manager.ts` | **新建** | Git Worktree 管理 |
| `desktop/src/main/tool-execution-bridge.ts` | **新建** | 工具自动执行 |
| `desktop/src/main/pty-manager.ts` | **重写为 PtyPool** | 单例→多终端池 |
| `desktop/src/main/chat-manager.ts` | **重构** | 增强为 Thread-aware 存储 |
| `desktop/src/main/ipc-registry.ts` | **修改** | 新增 thread:* 系列 handler |
| `desktop/src/main/index.ts` | **修改** | 初始化 ThreadManager |
| `desktop/src/preload/index.ts` | **修改** | 暴露 thread API |
| `desktop/src/renderer/src/App.tsx` | **修改** | 引入多线程 UI |
| `desktop/src/renderer/src/components/layout/MainLayout.tsx` | **重构** | 增加 Thread 切换 |
| `desktop/src/renderer/src/components/layout/ThreadView.tsx` | **新建** | 单 Thread 工作区 |
| `local-service/src/routes/exec.ts` | **修改** | 扩展白名单命令 |

---

## 4. Phase 2：体验对齐

### 4.1 Diff Review Panel（新建）

**位置**：`desktop/src/renderer/src/components/review/ReviewPanel.tsx`

**目标**：像 Codex 一样展示 Git diff，支持逐块 stage/revert 和行内评论。

```
┌─────────────────────────────────────────┐
│  审查    │  文件变更列表                  │
│  ────────┼─────────────────────────────│
│  □ src/  │  @@ -12,7 +12,8 @@          │
│    main  │  -  old code line            │
│    .ts   │  +  new code line            │
│          │    [Stage] [Revert] [+评论]  │
│  □ src/  │  @@ -45,5 +46,9 @@          │
│    util  │  -  old                      │
│    .ts   │  +  new                      │
│          │    [Stage] [Revert] [+评论]  │
│  ────────┼─────────────────────────────│
│  [Commit][Push][创建 PR]                │
└─────────────────────────────────────────┘
```

**依赖**：
- `GitManager.getDiff(projectPath)` → 取 diff 数据（已有）
- 前端渲染 unified diff 为可交互视图
- 已有 `GitManager.getStatus` + `checkout` + `createBranch` 支撑操作

### 4.2 审批策略引擎

**现有资源**：
- `desktop/src/renderer/src/components/layout/PlanApprovalDialog.tsx` — 已有对话框骨架
- `backend/src/main/java/com/agent/mvp/agent/tooling/ToolCall.java` — tool call 模型在后端已定义

**改造成审批策略引擎**：

```typescript
// desktop/src/main/approval-engine.ts

type ApprovalLevel = 'allow' | 'request' | 'deny'
type ResourceType = 'file:write' | 'file:read-external' | 'network' | 'shell:command' | 'shell:install'

interface ApprovalRule {
  resource: ResourceType
  pattern?: string        // glob 匹配，如 "~/.ssh/*" → deny
  level: ApprovalLevel
  comment?: string
}

interface ApprovalPolicy {
  rules: ApprovalRule[]
  defaultLevel: ApprovalLevel
  allowList: string[]     // 自动放行的命令
}

class ApprovalEngine {
  evaluate(action: { resource: ResourceType; target: string }): ApprovalLevel
  addRule(rule: ApprovalRule): void
  loadPolicy(policyPath: string): void
}
```

**规则示例**（参考 Codex `requirements.toml` 格式）：

```json
{
  "rules": [
    { "resource": "shell:command", "pattern": "npm install *", "level": "request" },
    { "resource": "file:write", "pattern": "~/.ssh/*", "level": "deny" },
    { "resource": "network", "pattern": "*", "level": "request" }
  ],
  "defaultLevel": "allow"
}
```

### 4.3 Skills 系统

Skills 是 Codex 最核心的扩展机制——比 MCP 更贴近用户，比 prompt 更结构化。

#### 4.3.1 Skill 定义格式

参考项目已有的 `.agents/skills/` 目录结构，规范化：

```markdown
---
name: my-skill
description: 这是一个自定义技能
triggers:
  - "run my-skill"
  - "@my-skill"
tools:                     # 可选：技能需要的额外工具
  - name: my_tool
    description: "自定义工具"
    input_schema: { ... }
---

# Skill 指令

这里写 Markdown 格式的指令，Agent 会在被触发时读取执行。

支持变量插值：{{workspacePath}} {{threadId}}

## 步骤
1. 第一步做什么
2. 第二步做什么
```

#### 4.3.2 Skill 发现

```typescript
class SkillManager {
  private scanPaths: string[] = [
    '~/.codex/skills/',        // 全局
    '<project>/.agents/skills/',  // 项目
    '<workspace>/.skills/',       // 工作区
  ]

  discoverSkills(): Skill[]     // 扫描所有路径
  getSkill(name: string): Skill | null
  runSkill(name: string, context: SkillContext): Promise<void>
  installSkill(source: string): Promise<void>
}
```

#### 4.3.3 Skill 执行流程

```
用户输入 "/my-skill" 或 "@my-skill"
  │
  ▼
SkillManager.getSkill("my-skill")
  │  读取 SKILL.md，解析 frontmatter + 指令
  │
  ▼
  ├─ 有 tools 定义 → 注册到 AgentToolOrchestrator
  └─ 有 scripts/ 目录 → 注入系统 prompt（告诉 Agent 脚本路径）
  │
  ▼
Agent 执行任务时自动使用 Skill 提供的工具和能力
```

**参考**：项目已有 `AgentToolOrchestrator.executeDynamicSkill()` 方法（扫描 `.agents/skills/` 和 `.Codex/skills/` 目录），可以作为 SkillManager 的后端支撑。

### 4.4 UI 组件新增清单（Phase 2）

| 组件名 | 路径 | 说明 |
|--------|------|------|
| `ThreadView.tsx` | `renderer/src/components/thread/` | 单线程完整工作区 |
| `ThreadList.tsx` | `renderer/src/components/thread/` | 左侧 Thread 切换列表 |
| `ReviewPanel.tsx` | `renderer/src/components/review/` | Diff 审查面板 |
| `DiffViewer.tsx` | `renderer/src/components/review/` | 逐行 diff 渲染 |
| `ApprovalDialog.tsx` | `renderer/src/components/approval/` | 通用审批对话框 |
| `ApprovalHistory.tsx` | `renderer/src/components/approval/` | 审批记录 |
| `S killManagerUI.tsx` | `renderer/src/components/skills/` | 技能浏览安装 |
| `SkillEditor.tsx` | `renderer/src/components/skills/` | 技能编辑器 |
| `InlineReview.tsx` | `renderer/src/components/review/` | 行内注释 |

---

## 5. Phase 3：扩展功能

### 5.1 Automations（定时任务）

**概念**：Skill + cron 调度 = Automation

```typescript
// desktop/src/main/automation-manager.ts
interface Automation {
  id: string
  name: string
  skillName: string
  schedule: string           // cron 表达式
  projectPath: string
  enabled: boolean
  lastRun: number | null
  lastResult: AutomationResult | null
}

class AutomationManager {
  createAutomation(config: Omit<Automation, 'id'>): Automation
  listAutomations(): Automation[]
  enable(id: string): void
  disable(id: string): void
  runNow(id: string): Promise<AutomationResult>
  delete(id: string): void
}
```

**执行流程**：
```
Cron 触发
  │
  ▼
创建临时 Thread（worktree 模式）
  │
  ▼
执行 Skill（和普通 Thread 同一套 Agent 链路）
  │
  ▼
结果写入 Review Queue
  │
  ▼
用户打开 Review Queue 审查 diff，决定是否合并
```

**复用**：
- cron 调度器：`node-cron` 或 `bree`
- skill 执行：复用 Phase 2 的 `SkillManager`
- review queue：复用 Phase 2 的 `ReviewPanel`

### 5.2 内嵌 WebView 浏览器

**位置**：`desktop/src/renderer/src/components/browser/BrowserView.tsx`

**技术选型**：Electron `<webview>` 标签或 `BrowserView` API

```typescript
// IPC 新增
ipcMain.handle('browser:navigate', (_event, url: string) => { ... })
ipcMain.handle('browser:execute-js', (_event, code: string) => { ... })
ipcMain.handle('browser:screenshot', () => { ... })
```

**Agent 集成**：将浏览器暴露为 Agent 的一个 Tool——Agent 可以让它访问 URL 并截图/提取内容回来（类似 Codex 的 Computer Use）。

### 5.3 沙箱集成（macOS Seatbelt）

**目标**：在启动后端时注入 Seatbelt profile，限制文件访问和网络。

**参考 Codex**：
- macOS：用 `sandbox-exec` 加载 `.sb` profile
- Linux：bubblewrap + seccomp
- Windows：restricted tokens + ACL

```bash
# macOS 沙箱示例
sandbox-exec -f codex.sb java -jar backend.jar ...
```

```lisp
;; codex.sb (Seatbelt profile)
(version 1)
(deny default)
(allow file-read* (subpath "/Users/liuyongze/Documents/AI-agent"))
(allow file-write* (subpath "/Users/liuyongze/Documents/AI-agent")
                    (subpath (param "TMPDIR")))
(allow network* (local ip "127.0.0.1"))
(deny network* (remote))
```

**位置**：`desktop/resources/sandbox/`，不同平台不同 profile。

### 5.4 Computer Use（控制其他 App）

**技术实现**：参考 Codex 的方案，用 macOS 原生 API 实现 "AI 看屏幕→操作 App" 的循环。

#### 5.4.1 四步循环

```
[1] 截图                → CGDisplayCreateImage() → png bytes
[2] 模型分析屏幕内容     → 多模态模型看截图，决定操作 (click [x,y] / type "hello")
[3] 注入系统事件        → CGEventPost 模拟鼠标/键盘事件
[4] 再次截图确认结果    → 确认操作生效，或决定下一步
                     ↺ 循环直到任务完成
```

#### 5.4.2 技术选型

| 层 | macOS API | 说明 |
|---|----------|------|
| **截图** | `CGDisplayCreateImage()` | 全屏截图，返回 CGImage → 转 png bytes |
| **鼠标控制** | `CGEventCreateMouseEvent()` + `CGEventPost()` | 模拟鼠标移动、点击、拖拽 |
| **键盘输入** | `CGEventCreateKeyboardEvent()` + `CGEventPost()` | 模拟按键、组合键 |
| **UI 树增强** | Accessibility API (`AXUIElementCopyAttributeValue`) | 可选增强：读取活跃 App 的 UI 元素树获取按钮精确坐标 |

#### 5.4.3 所需权限

| 权限 | 系统 API | macOS 设置路径 |
|------|----------|---------------|
| **Screen Recording** | CGDisplay 系列 | 系统设置 → 隐私 → 屏幕录制 |
| **Accessibility** | AX APIs + CGEvent | 系统设置 → 隐私 → 辅助功能 |

在 `entitlements.mac.plist` 中声明：
```xml
<key>com.apple.security.device.camera</key>
<true/>
<key>NSMicrophoneUsageDescription</key>
<string>AI Agent 需要麦克风权限以支持语音输入功能。</string>
```

#### 5.4.4 与 Agent 的集成

Computer Use 暴露为一个特殊的 Agent Tool：

```typescript
// Agent 调用的伪代码
tool: computer_use
args: {
  action: "screenshot" | "click" | "type" | "keypress" | "scroll",
  params: { x, y, text, key, dx, dy }
}
```

在 Agent Loop 流程中：
```
LLM 决定需要操作其他 App
  │
  ▼
发起 computer_use 工具调用
  │
  ▼
主进程执行：
  ├─ screenshot → 截图 → 给 LLM 看
  ├─ click [x,y] → CGEventPost 模拟点击
  └─ type "hello" → CGEventPost 模拟键盘输入
  │
  ▼
再次截图 → LLM 确认结果
```

#### 5.4.5 与 PtyPool / Thread Manager 的关系

Computer Use **不绑定到特定 Thread**，它是一个全局能力：
- 截图和操作的是整个屏幕，不局限于某个 worktree
- 在 Agent 的 tool 选择中，computer_use 和 execute_cli_command 并列

但注意：Computer Use **不建议和普通 Agent 任务混用**——应该由用户显式触发（比如在 Composer 中点击 "Computer Use" 按钮）。

### 5.5 Phase 3 新增文件清单

| 文件 | 说明 |
|------|------|
| `desktop/src/main/automation-manager.ts` | 自动化调度 |
| `desktop/src/main/automation-runner.ts` | 自动化执行器 |
| `desktop/src/main/browser-manager.ts` | 内嵌浏览器管理 |
| `desktop/src/main/sandbox-manager.ts` | 沙箱 profile 管理 |
| `desktop/src/renderer/src/components/automation/` | 自动化 UI |
| `desktop/src/renderer/src/components/browser/` | 浏览器 UI |
| `desktop/resources/sandbox/codex.macos.sb` | macOS 沙箱配置 |
| `desktop/resources/sandbox/codex.linux.sb` | Linux 沙箱配置 |

---

## 6. 数据流与接口设计

### 6.1 消息流（Chat/Agent 链路）

```
User Input (Renderer)
  │
  ▼
IPC: chat:send-with-context (同 session)
  │  ┌─ local-service: /context (文件上下文)
  │  └─ local-service: /context/files (选中文件)
  │
  ▼
IPC: HTTP → Backend POST /api/v1/agent/chat/stream
  │
  ▼
Backend Agent Loop
  ├─ 模型推理 → tool_call?
  ├─ 是 → SSE event: client_tool_call
  │       │
  │       ▼
  │    ToolExecutionBridge (IPC)
  │       ├─ Full-auto: 自动执行 → POST tool_result
  │       └─ Suggest: 弹审批对话框 → 用户确认 → POST tool_result
  │       │
  │       └── Backend 继续循环
  │
  └─ 否 → SSE event: chunk / done
          │
          ▼
      Renderer 更新消息列表
```

### 6.2 多线程管理流

```
Renderer: "新建 Thread"
  │
  ▼
IPC: thread:create { projectPath, name, mode }
  │
  ▼
ThreadManager.createThread()
  ├─ 1. 创建 Backend Session
  │      POST /api/v1/sessions → { id, title }
  │
  ├─ 2. (可选) 创建 Git Worktree
  │      git worktree add <path> <new-branch>
  │
  ├─ 3. 分配终端
  │      PtyPool.spawn(threadId, worktreePath || projectPath)
  │
  └─ 4. 持久化 Thread 元信息
         dataDir/threads/<threadId>.json
  │
  ▼
IPC: 返回 Thread { id, worktreePath, sessionId, terminalId }
  │
  ▼
Renderer: 切换到新 Thread，渲染 ThreadView
```

### 6.3 IPC 接口总表

#### Phase 1 新增

| Channel | 方向 | 说明 |
|---------|------|------|
| `thread:create` | invoke | 创建新线程 |
| `thread:list` | invoke | 列出所有线程 |
| `thread:get` | invoke | 获取线程详情 |
| `thread:switch` | invoke | 切换活跃线程 |
| `thread:archive` | invoke | 归档线程（清理 worktree） |
| `thread:close` | invoke | 关闭线程 |
| `thread:event` | push | 线程状态变更推送 |
| `tool:execute` | invoke | 手动触发工具执行 |
| `tool:result` | invoke | 工具执行结果回传 |
| `tool:approve` | invoke | 用户审批工具调用 |
| `terminal:list` | invoke | 列出所有终端 |
| `terminal:activate` | invoke | 激活指定终端 |

#### Phase 2 新增

| Channel | 方向 | 说明 |
|---------|------|------|
| `review:diff` | invoke | 获取 diff 数据 |
| `review:stage` | invoke | 暂存选定块 |
| `review:revert` | invoke | 还原选定块 |
| `review:comment` | invoke | 添加行内评论 |
| `review:commit` | invoke | 提交变更 |
| `skill:list` | invoke | 列出可用技能 |
| `skill:run` | invoke | 执行技能 |
| `skill:install` | invoke | 安装技能 |
| `approval:configure` | invoke | 配置审批策略 |

#### Phase 3 新增

| Channel | 方向 | 说明 |
|---------|------|------|
| `automation:create` | invoke | 创建自动化 |
| `automation:list` | invoke | 列出自动化 |
| `automation:run` | invoke | 立即执行 |
| `browser:navigate` | invoke | 打开 URL |
| `browser:screenshot` | invoke | 截图 |
| `sandbox:status` | invoke | 沙箱状态 |
| `sandbox:configure` | invoke | 沙箱配置 |

---

## 7. 现有代码复用清单

### 7.1 可以直接复用的组件

| 现有文件 | 作用 | 复用到 Phase |
|---------|------|-------------|
| `desktop/src/main/backend-manager.ts` | Java 进程管理 | 所有 Phase |
| `desktop/src/main/ipc-registry.ts` | IPC 注册中心模式 | 所有 Phase |
| `desktop/src/main/workspace-manager.ts` | 工作区管理 | Phase 1 Thread 集成 |
| `desktop/src/main/git-manager.ts` | Git 操作 | Phase 1 Worktree + Phase 2 Review |
| `desktop/src/main/chat-manager.ts` | 会话持久化 | Phase 1 升级为 Thread 存储 |
| `desktop/src/main/pty-manager.ts` | 终端管理 | Phase 1 改造为 PtyPool |
| `desktop/src/main/local-service-manager.ts` | 子进程管理 | 所有 Phase |
| `desktop/src/main/utils/network.ts` | 端口检测 | 所有 Phase |
| `desktop/src/preload/index.ts` | 安全 API 桥 | 所有 Phase（扩展） |
| `desktop/src/renderer/src/components/layout/ChatArea.tsx` | 聊天+终端 | Phase 1 ThreadView 核心 |
| `desktop/src/renderer/src/components/layout/SessionList.tsx` | 会话列表 | Phase 1 ThreadList |
| `desktop/src/renderer/src/components/layout/ContextPanel.tsx` | 文件上下文 | Phase 1 ThreadView 右栏 |
| `desktop/src/renderer/src/components/layout/PlanApprovalDialog.tsx` | 审批对话框 | Phase 2 通用审批 |
| `local-service/src/routes/context.ts` | 上下文聚合 | Phase 1 工具链路 |
| `local-service/src/routes/file.ts` | 文件读取 | Phase 1 工具链路 |
| `local-service/src/routes/exec.ts` | 白名单命令 | Phase 1 扩展 |
| `local-service/src/routes/workspace.ts` | 文件树 | Phase 1 持续使用 |
| `backend/.../AgentToolOrchestrator.java` | 工具注册+执行 | Phase 1 后端支撑 |
| `backend/.../ClientToolRegistry.java` | 远程工具调用 | Phase 1 增强 |
| `backend/.../ToolCallManager.java` | 批量工具调用 | Phase 1 增强 |
| `backend/.../AgentService.java` | Agent 主循环 | 核心引擎不变 |

### 7.2 需要改造的现有代码

| 现有文件 | 改动类型 | 说明 |
|---------|---------|------|
| `desktop/src/main/index.ts` | 修改 | 初始化 ThreadManager, WorktreeManager |
| `desktop/src/main/pty-manager.ts` | 重写 | 单例→PtyPool 多终端 |
| `desktop/src/main/chat-manager.ts` | 重构 | 增强为 Thread-aware 存储 |
| `desktop/src/main/ipc-registry.ts` | 扩展 | 新增 3 个 Phase 的 IPC handler |
| `desktop/src/renderer/src/App.tsx` | 重构 | 多线程感知 |
| `desktop/src/renderer/src/components/layout/MainLayout.tsx` | 重构 | 引入 Thread/Project 切换 |
| `local-service/src/routes/exec.ts` | 扩展 | 添加更多安全命令 |
| `backend/.../AgentToolOrchestrator.java` | 扩展 | 注册桌面端特有工具 |

---

## 8. 附录：Codex Desktop 能力对照表

| 能力 | Codex Desktop | 你的项目当前 | Phase 1 | Phase 2 | Phase 3 |
|------|:-----------:|:----------:|:-------:|:-------:|:-------:|
| 多线程并行 | ✅ | ❌ | ✅ | ✅ | ✅ |
| Git Worktree 隔离 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 每线程独立终端 | ✅ | ❌ | ✅ | ✅ | ✅ |
| Agent Tool 自动执行 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 多审批策略 | ✅ | mock | ✅ | ✅ | ✅ |
| Diff 审查面板 | ✅ | ❌ | ❌ | ✅ | ✅ |
| 行内代码注释 | ✅ | ❌ | ❌ | ✅ | ✅ |
| Commit/Push/PR | ✅ | ❌ | ❌ | ✅ | ✅ |
| Skills 系统 | ✅ | ❌ | ❌ | ✅ | ✅ |
| 多项目管理 | ✅ | ✅ 基础 | ✅ | ✅ | ✅ |
| 模型切换 | ✅ | ✅ 基础 | ✅ | ✅ | ✅ |
| 文件上下文 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 内嵌浏览器 | ✅ | ❌ | ❌ | ❌ | ✅ |
| Automations | ✅ | ❌ | ❌ | ❌ | ✅ |
| 沙箱隔离 | ✅ | ❌ | ❌ | ❌ | ✅ |
| Computer Use | ✅ | ❌ | ❌ | ❌ | ❌ |
| 多 Agent Pipeline | ❌ | ✅ | ✅ | ✅ | ✅ |
| Agent 反射验证 | ❌ | ✅ | ✅ | ✅ | ✅ |
| RAG 语义缓存 | ❌ | ✅ | ✅ | ✅ | ✅ |
| (你的独特优势) | | | | | |

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-06-19 | 初稿，框架搭建 + Phase 1 详细设计 |
