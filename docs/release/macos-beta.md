# macOS Beta 发行清单

当前候选版本由 `desktop/package.json` 作为单一版本源，所有可发行组件必须与它一致。当前计划版本为 `0.1.0-beta.1`，对应 Git tag 为 `v0.1.0-beta.1`。

## 发布前的外部配置

1. 在 GitHub 创建 `release` Environment，并配置以下 secrets：
   - `CSC_LINK`
   - `CSC_KEY_PASSWORD`
   - `APPLE_ID`
   - `APPLE_APP_SPECIFIC_PASSWORD`
   - `APPLE_TEAM_ID`
   同时设置至少一名 required reviewer（不允许发起人自行批准），并把 deployment branch/tag policy 限制为 `v*`。
2. 为 `main` 配置 active branch ruleset：要求 pull request，并要求 `release-preflight`、`python-service-test`、`backend-quality`、`desktop-test` 全部通过。另建一个匹配 `v*` 的 active tag ruleset，只允许 release maintainer 创建、更新或删除 tag。
3. tag 必须指向一个已合并、干净的提交。工作流与本地正式门禁都会验证 tag commit 是 `origin/main` 的祖先。
4. 将 npm registry TLS 连通性恢复到可用状态。发行验证不接受跳过 `npm audit` 或跳过 `npm ci`。
5. 确认 `lqq151510/flexagent` 的 GitHub Packages 允许本仓库 Actions 使用 `packages:read`；release runner 必须从远端解析该依赖，不能依赖本机 Maven 缓存。

## 本地候选验证

使用 Node.js 22（`.nvmrc`）和 JDK 21，在干净工作树执行：

```bash
npm --prefix desktop ci --no-audit --no-fund
npm --prefix desktop/src/renderer ci --no-audit --no-fund
npm --prefix ts-cli ci --no-audit --no-fund
npm --prefix local-service ci --no-audit --no-fund

GITHUB_ACTOR=<github-user> GITHUB_TOKEN=<packages-read-token> \
  ./scripts/release-check.sh dev
```

对 macOS 签名候选，使用规范化门禁：

```bash
GITHUB_ACTOR=<github-user> GITHUB_TOKEN=<packages-read-token> \
CSC_LINK=<base64-p12-or-path> CSC_KEY_PASSWORD=<certificate-password> \
APPLE_ID=<apple-id> APPLE_APP_SPECIFIC_PASSWORD=<app-password> \
APPLE_TEAM_ID=<team-id> \
./scripts/release-check-macos.sh
```

该门禁拒绝缺失的 Apple 凭据、脏工作树、非精确版本 tag、旧产物复用和未签名/未通过 Gatekeeper 的安装包。服务端生产烟测仍独立使用 `./scripts/release-check.sh prod` 和真实的 `env/prod.env`；桌面候选工作流不把该服务端部署步骤混入 macOS 打包。

正式门禁要求构建前 `desktop/release/` 不含任何安装包，构建后只含本次 tag 的 arm64 DMG 与 ZIP；若目录留有旧安装包，门禁会失败而不会自动删除它们。请使用干净 checkout 或先人工归档、核验旧产物。

## 触发与审核

1. 确认 `./scripts/check-release-version.sh` 通过。
2. 创建与 `desktop/package.json` 匹配的精确 tag，例如 `v0.1.0-beta.1`。
3. 由 `macOS Release Candidate` 工作流构建、签名、公证并上传 draft prerelease。
4. 在干净的 macOS Apple Silicon 设备上下载 draft 产物，确认启动、登录、会话、流式对话与嵌入式后端。
5. 复核 `release-manifest.json` 的 commit、`SHA256SUMS`、codesign、Gatekeeper 和 stapler 结果，再手工发布 draft。

## Beta 范围与回滚

- 包装版固定关闭 legacy developer tooling / Computer Use；若计划开启它，必须先完成单次审批 token、前台窗口白名单、截图隐私和 macOS 权限 fail-closed 的安全改造。
- 回滚方式是撤回 draft 或发布前一个已验证 tag 的安装包；不要覆盖同名 tag 或替换已发布资产。
