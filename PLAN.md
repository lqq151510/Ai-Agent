# AI-agent Desktop+CLI 后续改动计划

## Summary
- 主线按 **Desktop App + CLI** 收敛，Web 不恢复为一等入口。
- 当前主线：`main@66a1a67`；`v0.1.0-beta.3` 已作为 macOS Apple Silicon personal prerelease 发布。
- Beta.3 可下载，但它不是 CI 全绿的发布点：release-version 检出组件版本不一致，Ubuntu backend-quality 的两个 `CodeToolServiceTest` 搜索用例失败。既有 tag 与资产不回写、不移动；修复后以新的版本候选完成收口。
- 已合并的近期能力包括云端 DeepSeek/OpenAI/兼容端点配置、无模型本地启发式整理，以及 macOS 本地运行/打包脚本。
- 当前优先级：先完成发布工程收口与真实安装包回归，再继续 Computer Use Phase 2b 和 Automations Phase 3。

## 已完成

### 当前发布与本地化能力 ✅
- [x] `v0.1.0-beta.3` tag 与 GitHub prerelease 已创建，绑定 `main@66a1a67`。
- [x] DeepSeek、OpenAI 与 OpenAI-compatible 端点可由用户在 Knowledge Desk Settings 中配置；未配置或不可连接模型时基础知识管理保留本地降级能力。
- [x] 提供 `scripts/run-macos-local.sh` 与 `scripts/package-macos-local.sh`，用于 macOS 本机零模型运行与本地打包。

### Phase 0 — 稳定化（`b204c55`）✅
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

### P0 — 发布工程收口（当前最高优先级）

- [x] 本地工作树已统一 Desktop、CLI、local-service、根 Maven、backend 与 bug-sentinel-starter 为 `0.1.0-beta.3`；`./scripts/check-release-version.sh` 通过（2026-08-30）。
- [x] 本地工作树已为 `CodeToolService` 增加 `rg` 无法启动时的 Java 回退，并通过完整 backend `clean verify`；GitHub CI 仍待提交后重新触发并确认全绿。
- [ ] 对新候选重新下载 DMG/ZIP/SHA256SUMS，复算校验和，并验证 tag、commit 与资产绑定。
- [ ] 在隔离用户目录中完成真实 `.app` GUI 回归：启动、导入、浏览、搜索、无模型降级、退出清理和重启持久化。

### Phase 2b — Computer Use 可控化（P0/P1 后）

从"能用"做成"可控"：

- [x] **截图默认自动审批**：当 Computer Use 开启时，`screenshot` 动作在 `auto-edit` 模式下自动批准，无需用户确认。
- [x] **权限预处理与系统设置跳转**：面板挂载时自动检测 macOS Accessibility / Screen Recording 权限；未授权时显示引导横幅（含缺失权限列表），提供"打开系统设置"按钮跳转到对应隐私面板。
- [ ] **审批 UI**：点按/输入等操作前弹出审批对话框，展示目标（窗口标题、坐标、动作类型），用户确认才执行。
- [ ] **窗口/前台应用保护**：不在允许列表的窗口禁止自动点击；可配置白名单。
- [ ] **未知窗口处理**：检测到非白名单窗口弹前台时，拒绝 computer_use 执行并提示用户。
- [ ] **截图后确认流**：截图预览后用户确认再执行后续操作（点击/输入）。
- [ ] **快捷键/坐标策略稳定化**：修复跨分辨率/多屏场景下坐标偏移问题。

### Phase 3 — Automations（Computer Use 稳定后再做）

- [ ] cron 风格定时调度 + 临时 thread/worktree
- [ ] review queue：自动任务产出可审查 diff，确认后才合并
- [ ] 不与主工作区直接交互

## 验证状态与验收计划

### 当前已通过 ✅
- `/bin/bash ./scripts/check-consistency.sh`（2026-08-30）。
- 本机完整 Maven reactor：`bug-sentinel-starter` 4 tests、`backend` 345 tests，均为 0 failures、0 errors；backend 9 skipped，JaCoCo 行 76.51%（5598/7317）、分支 62.83%（1667/2653），门禁通过（2026-08-30，未提交工作树）。
- `CodeToolServiceTest` 包含 `rg` 无法启动时 Java 回退的新增覆盖；Spotless、`/bin/bash ./scripts/check-consistency.sh`、`./scripts/check-release-version.sh` 与 `git diff --check` 均通过（2026-08-30，未提交工作树）。
- Beta.3 CI 中 `desktop-test`、`python-service-test`、`deployment-config` 通过；这不替代整条主 CI。

### 当前失败 / 待收口 ⚠️
- GitHub CI/CD Pipeline #47：历史失败仍为 344 tests、2 failures、0 errors、9 skipped；本地修复尚未提交/推送，不能将本地验证写为 Beta.3 主 CI 已绿。
- 发布资产下载回验、真实 GUI、原生退出清理和重启持久化仍需在新候选上执行。
- Computer Use：验证权限拒绝提示 → 截图成功 → 受控窗口操作 → 禁止未知窗口自动点击。

## Assumptions
- `web/` 目录已删除，不恢复。
- 脚本中 `--skip-web` 作为 `--skip-renderer` 别名保留，不引入破坏性变更。
- Computer Use 仅 macOS 本机，Windows/Linux 暂不纳入。
- Automations 在 Computer Use 可控化稳定后再规划。
