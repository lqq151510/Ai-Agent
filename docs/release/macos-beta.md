# macOS Beta 发行清单

当前候选版本由 `desktop/package.json` 作为单一版本源，所有可发行组件必须与它一致。当前计划版本为 `0.1.0-beta.1`，对应 Git tag 为 `v0.1.0-beta.1`。

macOS bundle 的 Apple 版本字段单独受数值格式约束：本候选把 npm 版本 `0.1.0-beta.1` 映射为 `CFBundleShortVersionString=0.1.0` 和仓库控制的 `CFBundleVersion=1`。后续每个候选必须保留前者与 npm 版本的三段数字核心一致，并在 `desktop/electron-builder.yml` 中单调递增后者；不要使用可重跑的 GitHub run number。

## 发布前的外部配置

1. 在 GitHub 创建 `release` Environment，并配置以下 secrets：
   - `CSC_LINK`
   - `CSC_KEY_PASSWORD`
   - `APPLE_ID`
   - `APPLE_APP_SPECIFIC_PASSWORD`
   - `APPLE_TEAM_ID`
   同时设置至少一名 required reviewer（不允许发起人自行批准），并把 deployment branch/tag policy 限制为 `v*`。
2. 为 `main` 配置 active branch ruleset：要求 pull request，并要求 `release-preflight`、`python-service-test`、`backend-quality`、`desktop-test` 全部通过。另建一个匹配 `v*` 的 active tag ruleset：只允许 release maintainer 创建 tag，创建后禁止更新或删除；发布期间不得配置能绕过该不可变性的 bypass。
3. tag 必须指向一个已合并、干净的提交。工作流与本地正式门禁都会验证 tag commit 是 `origin/main` 的祖先；工作流会在创建 draft 前、创建后和下载验证结束前重新解析远端 tag（含 annotated tag 的 peeled commit），要求它始终等于本次候选构建的 commit。
4. 保持 npm registry TLS 连通性可用。发行验证不接受跳过 `npm audit` 或跳过 `npm ci`。
5. 确认 `lqq151510/flexagent` 的 GitHub Packages 允许本仓库 Actions 使用 `packages:read`，并在 package settings 中给 `Ai-Agent` workflow repository Read access。release runner 必须从远端解析该依赖，不能依赖本机 Maven 缓存；本地验证的 classic PAT 必须同时具备 `read:packages`（私有仓还需 `repo`）权限，不能直接复用缺少该 scope 的普通 `gh` 登录 token。

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

该门禁拒绝缺失的 Apple 凭据、脏工作树、非精确版本 tag、旧产物复用、错误 bundle 标识/版本、错误 Developer ID 身份，以及未签名或未通过 Gatekeeper 的安装包。它会先对 app 公证，再对最终 DMG 重新提交公证、staple，并分别验证 app 与 DMG 的票据和 Gatekeeper。服务端生产烟测仍独立使用 `./scripts/release-check.sh prod` 和真实的 `env/prod.env`；桌面候选工作流不把该服务端部署步骤混入 macOS 打包。

正式门禁要求构建前 `desktop/release/` 完全为空（包括旧 staging app、manifest 和辅助文件），构建后只允许本次架构的 `mac-arm64/` staging 目录作为 macOS app 证据；若目录留有任何旧条目，门禁会失败而不会自动删除它们。请使用干净 checkout 或先人工归档、核验旧产物。

## 触发与审核

1. 确认 `./scripts/check-release-version.sh` 通过。
2. 创建与 `desktop/package.json` 匹配的精确 tag，例如 `v0.1.0-beta.1`。
3. 由 `macOS Release Candidate` 工作流构建、签名、公证并上传 draft prerelease。它会反复以远端 tag 的 peeled commit 确认候选身份，并核验 release 的 tag、draft/prerelease 状态、标题和完整资产集合；不依赖可能仅显示默认分支的 `targetCommitish` 字段。只要同 tag 的 release 已存在（包括 draft），工作流都会 fail-closed，不会自动覆盖资产；经人工核验后清理错误 draft，再重新触发。
4. draft 创建后，工作流会从 GitHub Release 重新下载精确的 DMG、ZIP、`release-manifest.json` 和 `SHA256SUMS`，逐项比对本机刚生成候选的 SHA-256，再校验 checksum、manifest commit/资产名；随后先验证下载 DMG 外层的 stapler 与 Gatekeeper，再挂载它并验证其中 app 的 codesign、Gatekeeper、stapler 以及嵌入式 JRE 的 `java -version`。临时下载目录和 DMG 挂载点会在完成或失败时清理并安全 detach。
5. 第 4 步是下载物完整性与 macOS 信任链验证，不代替真机 GUI smoke。仍须在干净的 macOS Apple Silicon 设备上从 draft 下载，确认启动、登录、会话、流式对话与嵌入式后端。
6. GUI smoke 通过后，复核 draft 的 `release-manifest.json`、`SHA256SUMS` 与工作流记录，再由指定 release maintainer 手工发布 draft。工作流运行和下载验证期间，任何人不得通过网页或 API 发布 draft、替换资产或移动 tag；GitHub Release API 没有能与上传原子绑定的发布锁。

## Beta 范围与回滚

- 包装版固定关闭 legacy developer tooling / Computer Use；若计划开启它，必须先完成单次审批 token、前台窗口白名单、截图隐私和 macOS 权限 fail-closed 的安全改造。
- 回滚方式是撤回 draft 或发布前一个已验证 tag 的安装包；不要覆盖同名 tag 或替换已发布资产。
