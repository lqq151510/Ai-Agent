# macOS Beta 发行清单

当前候选版本由 `desktop/package.json` 作为单一版本源，所有可发行组件必须与它一致。`v0.1.0-beta.3` 已发布并指向 `66a1a67`，但该发布的版本一致性检查和主 CI 未收口：Desktop 为 Beta.3，而其他发行组件仍为 Beta.2，backend-quality 另有两个搜索测试失败。后续候选版本应在 P0 修复完成后确定；不得移动 Beta.3 tag 或替换其已有资产。

macOS bundle 的 Apple 版本字段单独受数值格式约束：npm 预发布版本应映射为同一三段数字核心的 `CFBundleShortVersionString`，并使用仓库控制、单调递增的 `CFBundleVersion`。后续每个候选必须保持这一映射；不要使用可重跑的 GitHub run number。

## 发布模式

- 带 `-beta.` 的个人 Beta 使用本机生成、ad-hoc 签名但未 Developer ID 签名/未公证的 DMG 和 ZIP，并手工创建 GitHub prerelease。它适合个人演示和作品集下载，但首次打开可能需要用户在 macOS 中确认信任。
- 不带 `-beta.` 的正式版本才进入 `macOS Release Candidate` GitHub Actions job，严格执行 Developer ID 签名、公证、staple、Gatekeeper 和下载回验。
- 个人 Beta 只放宽 Apple 信任链，不放宽版本一致性、源码 tag、依赖审计、测试、构建、校验和及真实启动 smoke。

## 正式签名发布的外部配置

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

## 个人 Beta 触发与审核

> `v0.1.0-beta.3` 是已发布但工程门禁未收口的历史例外，不代表以下清单已满足。下一候选必须按本节完整执行并重新获得 CI 证据。

1. 确认 `./scripts/check-release-version.sh` 和 `./scripts/release-check.sh dev` 通过，且 `main` 的 GitHub CI 全绿。
2. 在干净源码提交上用 Node.js 22 运行 `RELEASE_CHECK_DESKTOP_DISTRIBUTABLE=true RELEASE_CHECK_PREPARE_DESKTOP_BACKEND=true ./scripts/release-check.sh dev`，生成本次 DMG、ZIP、`release-manifest.json` 和 `SHA256SUMS`。
3. 创建与 `desktop/package.json` 匹配、且指向该提交的精确 tag，例如 `v<version>`；禁止移动或覆盖旧 tag。
4. 创建 GitHub prerelease，上传本次四个资产，并从 GitHub 重新下载核对 SHA-256、manifest commit、资产名和嵌入式 JRE。
5. 在 Apple Silicon macOS 上挂载 DMG，复制并启动应用，确认嵌入式后端就绪、登录/知识库主流程可用。未签名个人 Beta 的信任提示属于已知分发限制，不得写成已签名或已公证。

## 正式版本触发与审核

1. 创建不带 `-beta.`、与 `desktop/package.json` 匹配且可从 `origin/main` 到达的 tag。
2. 由 `macOS Release Candidate` workflow 构建、签名、公证并上传 draft release。只要同 tag release 已存在，工作流都会 fail-closed，不自动覆盖资产。
3. 工作流重新下载 DMG、ZIP、manifest 和 checksum，校验资产完整性、codesign、Gatekeeper、stapler 与嵌入式 JRE。
4. 真机 GUI smoke 通过后，由 release maintainer 人工发布 draft；构建和审核期间不得替换资产或移动 tag。

## Beta 范围与回滚

- 包装版固定关闭 legacy developer tooling / Computer Use；若计划开启它，必须先完成单次审批 token、前台窗口白名单、截图隐私和 macOS 权限 fail-closed 的安全改造。
- 回滚方式是撤回 draft 或发布前一个已验证 tag 的安装包；不要覆盖同名 tag 或替换已发布资产。
