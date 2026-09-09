# v0.1.0-beta.4：发布事实、验证边界与后续收口

> 本页记录当前发布事实、已验证范围与下一轮候选的收口项；它不是"CI 已全绿"或"完整 GUI 发布验收"的声明。

## 当前发布事实（2026-09-09）

- 主线提交：`main@09d3cb0fe3b698d38fca3c6a69ec142f384d252b`；发布后 `main` 继续推进（文档基线 `83cc80d`、CI 修复 `9a2e5b0`），`v0.1.0-beta.4` 的 tag/资产绑定不变。
- 发布 tag：`v0.1.0-beta.4`（annotated tag → `09d3cb0`，远端 API 已核验）。
- GitHub Release：<https://github.com/lqq151510/Ai-Agent/releases/tag/v0.1.0-beta.4>（macOS arm64 prerelease，2026-09-09T07:30:35Z 发布）。
- 在线资产：`AI.Agent-0.1.0-beta.4-mac-arm64.dmg`（409,851,145 字节）、`AI.Agent-0.1.0-beta.4-mac-arm64.zip`（406,399,993 字节）、`SHA256SUMS`、`release-manifest.json`。本版是首个随包发布 manifest 的版本。
- 签名边界：个人 Beta 使用 ad-hoc signing；没有 Developer ID 签名或 Apple notarization。第一次打开如被 Gatekeeper 拦截，需由用户在系统设置中显式确认。

## 下载回验（2026-09-09，已收口）

Beta.3 遗留的"发布后未重新下载复算"缺口已在本版关闭：

1. 从 GitHub Release 全量重新下载 DMG、ZIP、SHA256SUMS、release-manifest.json 到独立目录。
2. `shasum -a 256 -c SHA256SUMS`：DMG、ZIP 均 OK。
3. 绑定一致性：远端 annotated tag `v0.1.0-beta.4` → `09d3cb0` = `origin/main` = manifest `git.commit`，三方一致。
4. 资产大小：GitHub 资产字节数与 manifest 记录逐项一致。

### manifest `trackedDirty` 事件记录

产物在干净树上构建，首次清单 `trackedDirty=false`；产物重命名为点号风格后重新生成清单时，两份文档改动尚未提交，导致发布清单短暂记录 `trackedDirty=true`（与项目自身 CI 门禁 `manifest.git.trackedDirty !== false` 的标准冲突）。随后在 `09d3cb0` 的干净 detached worktree 中重新生成并替换该资产：`commit` 仍为 `09d3cb0`、`trackedDirty=false`、DMG/ZIP SHA-256 与已发布值逐字节一致；`branch` 字段为 `HEAD`（detached worktree 如实记录），`applications` 的 codesign/gatekeeper 结论不变。SHA256SUMS 内容未变，未重新上传。

## 质量基线（`main@09d3cb0`，发布前本机全量验证）

- 后端 387 项测试：373 通过 / 0 失败 / 0 错误 / 14 跳过；JaCoCo 行 77.69%、分支 64.26%（门禁：行 ≥65%、分支 ≥60%）。
- Spotless、`check-consistency.sh`、`check-release-version.sh`、`git diff --check` 全部通过。
- DMG `hdiutil verify` 通过；DMG/ZIP 各恰含一个 `.app`；bundle 元数据一致（`com.agent.aiagent` / `0.1.0` / `4`）；主 executable 与内置 JRE 均为 Mach-O arm64。
- 隔离 `--user-data-dir` 双启动 smoke：模型不可用时 `ready=true` 降级启动（`MODEL_PROVIDER_UNAVAILABLE` 不阻塞基础知识管理）、H2 数据落盘、退出无后端进程残留、重启数据复用。

## CI 状态与 js-yaml 事件（如实记录）

| 提交 | 结果 | 说明 |
| --- | --- | --- |
| `09d3cb0`（tag） | macOS Release Candidate 通过；CI/CD Pipeline 中 backend-quality、desktop-test、python-service-test、deployment-config、sentinel-alert 通过，**release-preflight 失败** | backend-quality 通过证明 Beta.3 遗留的 `CodeToolServiceTest` Ubuntu 失败已修复 |
| `83cc80d`（文档） | CI/CD Pipeline 失败 | 与 `09d3cb0` 同因（见下） |
| `9a2e5b0`（修复） | CI/CD Pipeline 全绿（release-preflight、desktop-test、deployment-config、python-service-test、backend-quality 全部通过；sentinel-alert 条件触发 skipped） | lockfile-only 修复 |

`release-preflight` 失败根因：npm 新披露公告 GHSA-2883-xcg3-v3hh（js-yaml 4.0.0–4.3.1，YAML merge-key CPU DoS）。js-yaml 是 electron-builder 的 dev-only 传递依赖，**不随产物分发**——已验证发布包 `app.asar` 与 `app.asar.unpacked` 中 0 处 js-yaml 引用。此前 `b0d072e` 在审计干净时删除了临时豁免文件 `desktop/npm-audit-policy.json`，公告发布后 preflight 失去豁免通道而失败。修复：`9a2e5b0` 将 lockfile 中 js-yaml 4.3.1 → 4.3.2（仅 3 行版本/完整性变更），`npm audit` 归零。

## Beta.3 历史摘要

Beta.3（`main@66a1a67`，2026-08-29 发布）存在两个发布工程问题：组件版本不一致（`desktop/package.json` 已升 beta.3 但 ts-cli、local-service、Maven POM 等仍是 beta.2）与 `CodeToolServiceTest` 两个搜索用例在 Ubuntu CI 失败（服务直接调用宿主机 `rg`）。两者均已在 `9686f46` 修复（版本对齐 + "优先 `rg`、无法启动时 Java 回退"），但修复未回写到 Beta.3 tag/资产，因此 Beta.4 以新候选收口。Beta.3 及更早的发布资产保留在 Release 页面作为历史。

## 仍需收口的验证

1. 从**下载后的** `.app` 做隔离 `--user-data-dir` 完整人工 GUI 回归：启动、基础导入、浏览、搜索、标签、归档、复习、退出后后端清理、重启后数据恢复。（发布前的双启动 smoke 基于本机构建产物；下载资产已完成 SHA-256 复算，但未做完整 GUI 走查。）
2. 演示录屏（2–3 分钟）：模型不可用降级路径 + 工程证据（tag 绑定、SHA-256 复算、隔离 smoke），对应 `docs/portfolio/DEMO_SCRIPT.md`。
3. 可选：一个真实但脱敏的云端模型 API 配置验证（不记录、不回显密钥）。

## 后续产品优先级

发布收口完成后，继续 Computer Use Phase 2b：审批 UI、窗口白名单、未知窗口拒绝、截图确认和多屏坐标稳定化。Automations Phase 3 保持在其后：临时 worktree、review queue 与确认后合并，不直接操作主工作区。
