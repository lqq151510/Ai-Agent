# AI-agent Desktop+CLI 后续改动计划

## Summary
- 主线按 **Desktop App + CLI** 收敛，Web 不恢复为一等入口。
- **Phase 0（稳定化）+ Phase 1（Tool 闭环）+ Phase 2（Computer Use 骨架）** 已落地于 `b204c55`。
- 当前状态：构建/类型检查链路已通，剩余工作是 Computer Use 从"能用"到"可控"，以及后续 Automations。
- 后端测试因需要 Docker/Testcontainers 环境，`mvn test` 暂时跳过，不影响代码逻辑验证。

## 已完成（`b204c55` 及之前提交）

### Phase 0 — 稳定化 ✅
- [x] `WindowManager.loadContent()`：dev 加载本地 renderer dev URL，packaged 加载 `dist/renderer/index.html`，不再走远程页面。
- [x] desktop renderer 类型检查通过（`npx tsc -p src/renderer/tsconfig.app.json --noEmit` 无错误）。
- [x] 删除未使用 import/变量；`ThreadSummary` 类型隔离在 renderer-local，不反向 import main 进程源码。
- [x] `deploy.sh`、`rollback.sh` 已清理不存在的 `web` service 引用。
- [x] `desktop/scripts/build-all.sh` 构建 `desktop/src/renderer`（`--skip-web` 作为 `--skip-renderer` 的向后兼容别名保留）。
- [x] README/desktop README 更新，明确交付入口是 Desktop+CLI，Compose 是 backend/python-service/依赖栈。
- [x] `tsconfig.main.json`、`tsconfig.app.json`、`tsconfig.node.json` 类型检查全部通过。

### Phase 1 — Tool 调用闭环 ✅
- [x] `client_tool_call` 从只转发 SSE 改为由 main 进程消费 → `ToolExecutionBridge` 执行或进入审批引擎。
- [x] 审批结果类型明确：`auto-approved | requires-approval | rejected`。
- [x] `approval:set-mode` 真实影响 bridge 行为。
- [x] tool result 授权：bridge 使用 `ensureDesktopAccessToken()` 异步获取真实 token，不再用空 token。
- [x] Desktop token 改为真实异步获取。

### Phase 2 — Computer Use 第一版 ✅
- [x] 新增 `ComputerUseManager`（macOS）：截图、点击、输入、快捷键、滚动、权限探测。
- [x] IPC 通道：`computer:screenshot`、`computer:click`、`computer:type`、`computer:key`、`computer:scroll`、`computer:permissions`。
- [x] Agent tool：`computer_use`，参数 `{ action, params }`，默认走审批。
- [x] 右侧 `ComputerUsePanel`：权限状态、最近截图、手动测试按钮。
- [x] 文档同步：README.md、desktop/README.md、003-phase3-computer-use-automations-plan.md。

## 待做

### Phase 2b — Computer Use 可控化（下一优先级）

从"能用"做成"可控"：

- [ ] **审批 UI**：点按操作前弹出审批对话框，展示目标（窗口标题、坐标、动作类型），用户确认才执行。
- [ ] **窗口/前台应用保护**：不在允许列表的窗口禁止自动点击；可配置白名单。
- [ ] **未知窗口处理**：检测到非白名单窗口弹前台时，拒绝 computer_use 执行并提示用户。
- [ ] **权限失败提示**：macOS Accessibility/Screen Recording 权限未授权时，引导用户到系统偏好设置。
- [ ] **截图后确认流**：截图预览后用户确认再执行后续操作（点击/输入）。
- [ ] **快捷键/坐标策略稳定化**：修复跨分辨率/多屏场景下坐标偏移问题。

### Phase 3 — Automations（Computer Use 稳定后再做）

- [ ] cron 风格定时调度 + 临时 thread/worktree
- [ ] review queue：自动任务产出可审查 diff，确认后才合并
- [ ] 不与主工作区直接交互

## Test Plan 状态

### 基线已通过 ✅
- `./scripts/check-consistency.sh`
- `docker compose config --quiet && docker compose config --services`

### Java 编译 ✅
- `mvn -q -DskipTests compile` 通过

### TypeScript 编译 ✅
- `cd ts-cli && npm run typecheck && npm run build`
- `cd local-service && npx tsc -p tsconfig.json --noEmit`
- `cd desktop && npx tsc -p tsconfig.main.json --noEmit`
- `cd desktop/src/renderer && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.node.json --noEmit && npm run build`

### 待验证（需要手动环境）
- `mvn test`：需要本机 Docker/Testcontainers，当前跳过，非代码逻辑问题。
- Smoke 测试：启动 renderer + Electron，确认本地 UI 加载 → 创建 thread → chat → `client_tool_call → approval/tool execution → tool_result` 闭环。
- Computer Use：验证权限拒绝提示 → 截图成功 → 受控窗口操作 → 禁止未知窗口自动点击。

## Assumptions
- `web/` 目录已删除，不恢复。
- 脚本中 `--skip-web` 作为 `--skip-renderer` 别名保留，不引入破坏性变更。
- Computer Use 仅 macOS 本机，Windows/Linux 暂不纳入。
- Automations 在 Computer Use 可控化稳定后再规划。
