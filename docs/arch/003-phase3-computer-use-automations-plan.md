# Phase 3 落地计划：Computer Use + Automations

> 版本：v0.1 | 日期：2026-06-19 | 状态：规划
> 前置依赖：Phase 1（多线程+Tool链路）+ Phase 2（Review+Skills）已完成

---

## 概述

Phase 3 解决两大能力缺口：**AI 控制其他应用** 和 **定时后台任务**。

```
Phase 3
├── Track A: Computer Use（操作其他 App）
│   ├── A1: Screen Capture（截图模块）
│   ├── A2: Input Injection（鼠标/键盘注入）
│   ├── A3: Accessibility 增强
│   ├── A4: Agent Tool 集成
│   └── A5: UI 控制面板
│
└── Track B: Automations（定时后台任务）
    ├── B1: 调度引擎（cron）
    ├── B2: 执行器（复用 Thread + Skill）
    ├── B3: Review Queue
    └── B4: Automations 管理 UI
```

## Track A — Computer Use

### 架构

```
┌─────────────────────────────────────────────────┐
│  Renderer (React)                               │
│  └─ ComputerUsePanel ──toggle──→ IPC            │
├────────────────── IPC ─────────────────────────┤
│  ComputerUseManager                             │
│  ├─ screenshot() → base64 PNG                   │
│  ├─ click(x, y, button)                         │
│  ├─ type(text)                                  │
│  ├─ keypress(key)                               │
│  ├─ scroll(dx, dy)                              │
│  └─ getUIElement(at: x, y)                     │
├────────────────── ─────────────────────────────┤
│  底层 macOS API (via child_process)             │
│  └─ scripts/cu-screenshot.swift                 │
│  └─ scripts/cu-click.swift                      │
│  └─ scripts/cu-type.swift                       │
└─────────────────────────────────────────────────┘
```

### A1: 截图模块

用 Swift 脚本调用 macOS 原生 API：

```swift
// scripts/cu-screenshot.swift
import Cocoa
import CGImage

func captureScreen() -> Data? {
    let displayID = CGMainDisplayID()
    guard let image = CGDisplayCreateImage(displayID) else { return nil }
    let bitmap = NSBitmapImageRep(cgImage: image)
    return bitmap.representation(using: .png, properties: [:])
}

if let data = captureScreen() {
    FileHandle.standardOutput.write(data)
}
```

调用方式：
```typescript
// ComputerUseManager
async screenshot(): Promise<string> {
  const result = await execAsync('swift scripts/cu-screenshot.swift');
  return Buffer.from(result.stdout).toString('base64');
}
```

### A2: 输入注入

```swift
// scripts/cu-click.swift
import Cocoa

let args = CommandLine.arguments
let x = Double(args[1])!
let y = Double(args[2])!
let button = args.count > 3 ? Int(args[3])! : 0  // 0=left, 1=right

let point = CGPoint(x: x, y: y)
let eventDown = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown,
                        mouseCursorPosition: point, mouseButton: CGMouseButton(button))
let eventUp = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp,
                      mouseCursorPosition: point, mouseButton: CGMouseButton(button))
eventDown?.post(tap: .cghidEventTap)
eventUp?.post(tap: .cghidEventTap)
```

```swift
// scripts/cu-type.swift
import Cocoa

let text = CommandLine.arguments[1]
let source = CGEventSource(stateID: .hidSystemState)

for char in text {
    if let keyCode = charToKeyCode(char) {
        let eventDown = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
        let eventUp = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
        eventDown?.post(tap: .cghidEventTap)
        eventUp?.post(tap: .cghidEventTap)
        usleep(10_000) // 10ms between keystrokes
    }
}
```

### A3: Accessibility 增强（可选）

读取 UI 元素树获取精确坐标，比纯像素定位更可靠：

```swift
// scripts/cu-accessibility.swift
import Cocoa

let app = NSWorkspace.shared.frontmostApplication!
let pid = app.processIdentifier
let appElem = AXUIElementCreateApplication(pid)

var role: CFTypeRef?
AXUIElementCopyAttributeValue(appElem, "AXRole" as CFString, &role)
// 递归遍历 UI 树获取按钮/输入框位置
```

### A4: Agent Tool 集成

Computer Use 作为 Agent 的一个 Tool：

```typescript
// 在 ToolExecutionBridge 或新的 ComputerUseBridge 中
tool: "computer_use"
args: {
  action: "screenshot" | "click" | "type" | "keypress" | "scroll",
  params: { x, y, text, key, dx, dy }
}
```

在 ApprovalEngine 中分类为 `computer` 资源类型，默认需要 user 审批。

### A5: 所需权限

macOS 需要在 `entitlements.mac.plist` 加：

```xml
<key>com.apple.security.device.camera</key>
<true/>
<key>com.apple.security.device.microphone</key>
<true/>
```

用户需要在系统设置中授予：
- 屏幕录制权限（Screen Recording）
- 辅助功能权限（Accessibility）

### 新增文件

| 文件 | 说明 |
|------|------|
| `desktop/scripts/cu-screenshot.swift` | 截图脚本 |
| `desktop/scripts/cu-click.swift` | 鼠标点击脚本 |
| `desktop/scripts/cu-type.swift` | 键盘输入脚本 |
| `desktop/scripts/cu-accessibility.swift` | UI 树读取（可选） |
| `desktop/src/main/computer-use-manager.ts` | Computer Use 管理器 |
| `desktop/src/main/computer-use-bridge.ts` | Agent Tool 桥接 |
| `desktop/src/renderer/src/components/computer-use/` | UI 面板 |

---

## Track B — Automations

### 架构

```
cron 调度 (node-cron / bree)
  │
  ▼
AutomationRunner
  ├─ 创建临时 Thread（worktree 模式）
  ├─ 执行 Skill（复用 Phase 2 的 SkillManager）
  └─ 结果写入 Review Queue
  │
  ▼
用户打开 Review Queue → 审查 diff → 决定合并/丢弃
```

### B1: 数据结构

```typescript
interface Automation {
  id: string
  name: string
  skillName: string
  schedule: string          // cron 表达式: "0 9 * * 1-5"
  projectPath: string
  params?: Record<string, string>
  enabled: boolean
  lastRun: number | null
  lastStatus: 'success' | 'error' | null
}
```

### B2: 调度引擎

使用 `node-cron` 在 Electron 主进程运行：

```typescript
import cron from 'node-cron'

class AutomationManager {
  private jobs = new Map<string, cron.ScheduledTask>()

  startAll(automations: Automation[]): void {
    for (const auto of automations) {
      if (!auto.enabled) continue
      const job = cron.schedule(auto.schedule, () => {
        this.run(auto.id)
      })
      this.jobs.set(auto.id, job)
    }
  }

  async run(automationId: string): Promise<void> {
    // 1. 创建临时 Thread (worktree 模式)
    // 2. 执行 Skill
    // 3. 结果写入 Review Queue
    // 4. 清理 Worktree
  }
}
```

### B3: Review Queue

```typescript
interface ReviewQueueItem {
  id: string
  automationId: string
  title: string
  createdAt: number
  status: 'pending' | 'approved' | 'rejected'
  worktreePath: string
  diffSummary: string
  threadId: string
}

class ReviewQueue {
  private items: ReviewQueueItem[] = []

  add(item: ReviewQueueItem): void
  approve(id: string): Promise<void>   // 合并 worktree
  reject(id: string): Promise<void>    // 删除 worktree
  list(): ReviewQueueItem[]
}
```

### B4: 文件清单

| 文件 | 说明 |
|------|------|
| `desktop/src/main/automation-manager.ts` | 自动化调度 |
| `desktop/src/main/automation-runner.ts` | 自动化执行器 |
| `desktop/src/main/review-queue.ts` | 审查队列 |
| `desktop/src/renderer/src/components/automation/` | 管理 UI |
| `desktop/src/renderer/src/components/review/ReviewQueuePanel.tsx` | 审查队列 UI |

---

## 工作量估算

| 任务 | 预估工时 |
|------|---------|
| A1-A2: 截图 + 输入注入 | 2-3h |
| A3: Accessibility 增强 | 1-2h |
| A4: Agent Tool 集成 | 1-2h |
| A5: UI 控制面板 | 2-3h |
| **Track A 合计** | **6-10h** |
| B1-B2: 调度引擎 + 执行器 | 2-3h |
| B3: Review Queue | 1-2h |
| B4: 管理 UI | 2-3h |
| **Track B 合计** | **5-8h** |

两条 Track 无依赖，可并行或按任意顺序推进。
