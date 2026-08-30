# v0.1.0-beta.3：发布事实、验证边界与后续收口

> 本页记录当前发布事实、已验证范围与下一轮候选的收口项；它不是“CI 已全绿”或“完整 GUI 发布验收”的声明。

## 当前发布事实（2026-08-29）

- 主线提交：`main@66a1a67bcdeb6f41aa94c7c14c33ea14dbb17f40`，本地 `main` 与 `origin/main` 对齐。
- 发布 tag：`v0.1.0-beta.3`，指向上述提交。
- GitHub Release：<https://github.com/lqq151510/Ai-Agent/releases/tag/v0.1.0-beta.3>（macOS arm64 prerelease）。
- 在线资产：`AI.Agent-0.1.0-beta.3-mac-arm64.dmg`、`AI.Agent-0.1.0-beta.3-mac-arm64.zip`、`SHA256SUMS`。Release 页面列出了 DMG 与 ZIP 的 SHA-256；本页更新时没有重新下载并复算校验值。
- 签名边界：个人 Beta 使用 ad-hoc signing；没有 Developer ID 签名或 Apple notarization。第一次打开如被 Gatekeeper 拦截，需由用户在系统设置中显式确认。

Beta.3 相对上一候选新增了云端模型提供方配置与知识整理调整，以及 macOS 无模型本地运行/打包脚本。它仍保留“模型不可用时基础知识管理可工作”的产品边界；云端模型、密钥存储和实际模型调用必须在隔离测试数据与不回显密钥的条件下验证。

## Beta.3 当前 CI 状态

| 范围 | 当前事实 | 结论边界 |
| --- | --- | --- |
| Git/tag | `main`、`origin/main`、`v0.1.0-beta.3` 均指向 `66a1a67` | 证明源码/tag 对齐，不替代构建验证 |
| Release | GitHub Pre-release 已发布，资产为 DMG、ZIP、SHA256SUMS | 未在本页更新时下载并复算校验和 |
| macOS RC | workflow 成功；签名构建 job 为 skipped | 不证明 CI 产出了签名或公证的候选安装包 |
| 主 CI | CI/CD Pipeline #47 为 failure | 不可对外宣称“主 CI 全绿” |
| release preflight | #47 失败时组件版本不一致；本地 P0 工作树已对齐为 Beta.3 | 仍须提交并让新的 CI run 通过 |
| backend-quality | #47 为 344 tests、2 failures、0 errors、9 skipped；本地 P0 工作树完整验证为 345 tests、0 failures、0 errors、9 skipped | 本地结果尚未绑定不可变提交，不能表述为 Beta.3 CI 质量结论 |
| GUI 回归 | 尚无当前 Beta.3 的真实人工 GUI 回归证据 | 不写为完整 macOS 发布验收 |

CI 的已知失败包括：

1. #47 中 `desktop/package.json` 是 `0.1.0-beta.3`，但 `ts-cli`、`local-service`、根 Maven POM、backend 与 bug-sentinel-starter 仍是 `0.1.0-beta.2`。
2. #47 中 `CodeToolServiceTest` 的两个搜索用例在 Ubuntu CI 失败；服务当时直接调用宿主机 `rg`。该前置条件已在本地 P0 工作树修复为“优先 `rg`、无法启动时 Java 回退”，仍须由新的 Linux CI run 验证。

## 当前源码的 P0 本地验证（2026-08-30，未提交工作树）

以下验证针对 `main@66a1a67` 之上的本机工作树改动，不代表 Beta.3 发布物、不可变提交或主 CI 的完整验收：

```bash
/bin/bash ./scripts/check-consistency.sh
./scripts/check-release-version.sh
mvn --settings .mvn/settings.xml -pl backend \
  com.diffplug.spotless:spotless-maven-plugin:2.43.0:check
mvn --settings .mvn/settings.xml -pl backend -am clean verify
git diff --check
```

结果：所有命令通过。版本门禁确认 Desktop、CLI、local-service、根 Maven、backend 和 bug-sentinel-starter 均为 `0.1.0-beta.3`；完整 Maven reactor 中 starter 4 tests、backend 345 tests，均为 0 failures、0 errors，backend 9 skipped。JaCoCo 行 76.51%（5598/7317）、分支 62.83%（1667/2653），门禁通过。`CodeToolServiceTest` 22 项包含 `rg` 无法启动时 Java 回退的覆盖。

## 历史开发基线（2026-08-27，main@344b740）

这是一份历史、非发布、非 Beta.3 质量快照。完整 Maven `clean verify` 当时记录 backend 344 tests、0 failures、0 errors、9 skipped，JaCoCo 行 76.39%（5543/7256）、分支 62.87%（1649/2623）。这些数字绑定旧提交，后续对外引用时必须注明日期、提交和后端范围，不能直接归因给 Beta.3。

当时的候选 `.app` 还完成了包内资源布局与隔离启动 smoke：内置 JRE 启动后端，`/api/v1/system/health/ready` 返回 HTTP 200 和 `ready=true`；模型端点不可用时仅作为可选依赖警告，不阻塞基础启动。

该记录可用于说明验证方法和降级边界，不能作为 Beta.3 的 DMG/ZIP 下载回验、Gatekeeper、人工 GUI、原生退出清理、重启持久化或性能结论。

## Beta.3 发布后仍需收口的验证

1. 提交本地 Beta.3 版本对齐与 `CodeToolService` 回退修复，并确认新的 CI/CD Pipeline 全绿；单独保存 run URL 与日志摘要。
2. 在新的、不可变提交上重新记录版本门禁、完整 backend `clean verify` 与 JaCoCo 数据；本页的本地工作树数字不得替代该记录。
3. 下载新候选的 DMG、ZIP 和 SHA256SUMS，重新计算校验值并确认 tag/commit/资产一致。
4. 从下载后的 `.app` 做隔离 `--user-data-dir` GUI 回归：启动、基础导入、浏览、搜索、标签、归档、复习、退出后后端清理、重启后数据恢复。
5. 分别验证无模型降级和一个真实但脱敏的 DeepSeek/OpenAI/兼容 API 配置；不得记录或展示真实 API Key。

Beta.3 的 tag 和 Release 已创建，不能通过修改 tag 或替换资产来“补绿”。修复版本门禁和 CI 后，应创建新的版本候选，并把新的质量数字绑定到重新验证后的不可变提交。

## 后续产品优先级

发布收口完成后，继续 Computer Use Phase 2b：审批 UI、窗口白名单、未知窗口拒绝、截图确认和多屏坐标稳定化。Automations Phase 3 保持在其后：临时 worktree、review queue 与确认后合并，不直接操作主工作区。
