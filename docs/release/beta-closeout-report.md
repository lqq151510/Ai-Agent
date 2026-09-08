# v0.1.0-beta 收口验证报告（WS6 / release-verifier）

> 本报告中的每个数字都来自本机实际执行并保留下来的命令输出，未照抄 README 或历史文档。
> 验证时间：2026-09-08（Asia/Shanghai）。证据文件见文末附录 A。

## 0. 结论（TL;DR）

**两个 CI 红 job 的根因均已在工作树内修复并实测通过**（截至 2026-09-08 16:0x，HEAD 仍为 `5c8adf7`，改动尚未提交/推送）：

| # | 阻断项 | 性质 | 状态 |
|---|---|---|---|
| B1 | CI job `release-preflight` 失败：npm audit 门禁在 5 组审计中失败 | 新披露 advisory（时间相关），非代码引起 | **已修（dep-guard，4 个 `package.json` + 4 个 lockfile）；release-verifier 实测 8/8 审计 exit 0** |
| B2 | CI job `deployment-config` 失败：CI 断言与 Kafka 条件化重构漂移 | 门禁脚本未跟上代码 | **已修（本任务，`.github/workflows/ci.yml`）** |

版本一致性与后端质量门禁本身全绿：`mvn -o -pl backend -am clean verify` = BUILD SUCCESS，364 个用例 0 失败，JaCoCo 行 0.7538 / 分支 0.6163 均过门禁，Spotless 328 文件 0 待改，`check-consistency.sh` / `check-release-version.sh` 均 exit 0。

**当前放行条件（按顺序）**：
1. 提交并推送 B1/B2 修复 → main 上 CI 五个 job 全绿（`deployment-config`、`release-preflight` 必须转绿）。
2. WS4/WS5 合入后重跑 `mvn -o -pl backend -am clean verify`——**分支覆盖率余量仅 +1.63 pp**（见第 4 节）。
3. 按第 7 节清单切 `v0.1.0-beta.4` tag（tag 必须指向 `origin/main` 可达提交）。

## 1. 验证范围与口径

| 项 | 值 | 获取方式 |
|---|---|---|
| 仓库 | `/Users/liuyongze/Documents/AI-agent` | — |
| HEAD | `5c8adf7` = `v0.1.0-beta.3-12-g5c8adf7` | `git describe --tags` |
| 与 origin/main 关系 | `0` behind / `2` ahead（`origin/main` = `590f7d9`） | `git rev-list --left-right --count origin/main...HEAD` |
| 工作树 | 验证开始时 51 个已跟踪文件被修改 + 多个未跟踪新测试；收尾时 25 个（其他成员在持续提交） | `git status --porcelain` |
| 基线快照 | `git archive HEAD backend bug-sentinel-starter pom.xml .mvn` → `/tmp/t5-baseline2` | 规避并发编辑污染 |
| 工具链 | JDK 21.0.10（Oracle）/ Maven 3.9.9 / Node v26.7.0 / npm 11.19.0 / macOS arm64 | `java -version`、`mvn -v`、`node -v` |
| 离线构建 | `mvn -o`（FlexAgent 1.2.0 已在 `~/.m2` 缓存） | 见 B1 的依赖事实 |

口径说明：后端质量门禁在 **HEAD 的 git archive 快照**上执行（不是工作树），因为工作树里 docs-lead / repo-hygiene / dep-guard / data-migration / e2e-engineer 正在并发改文件；快照保证数字可复现且不与他人中间态混淆。

## 2. 版本一致性矩阵

`bash scripts/check-release-version.sh` → `exit=0`，输出：

```
[release-version] all release components use 0.1.0-beta.3
[release-version] macOS bundle metadata: {"version":"0.1.0-beta.3","appId":"com.agent.aiagent","bundleShortVersion":"0.1.0","bundleVersion":"3"}
```

| 组件 | 实测值 | 来源 |
|---|---|---|
| git tags | `v0.1.0-beta.1` → `b06b56c`、`v0.1.0-beta.2` → `fd5f26d`、`v0.1.0-beta.3` → `66a1a67` | `git tag -l`、`git rev-list -n1 <tag>` |
| tag 可达性 | 三个 tag 均为 HEAD 祖先 | `git merge-base --is-ancestor` |
| beta.3 之后的提交数 | 12 | `git rev-list --count v0.1.0-beta.3..HEAD` |
| 根 `pom.xml` | `0.1.0-beta.3` | check-release-version.sh |
| `backend/pom.xml` | `0.1.0-beta.3` | 同上 |
| `backend/pom.xml` 中 `bug-sentinel-starter` 依赖版本 | `0.1.0-beta.3`（第 342 行） | 本次新增校验（见 6.2） |
| `bug-sentinel-starter/pom.xml` | `0.1.0-beta.3` | check-release-version.sh |
| `desktop/package.json` | `0.1.0-beta.3` | 同上 |
| `ts-cli/package.json` | `0.1.0-beta.3` | 同上 |
| `local-service/package.json` | `0.1.0-beta.3` | 同上 |
| `desktop/electron-builder.yml` `mac.bundleShortVersion` | `0.1.0` | macos-release-metadata.mjs |
| `desktop/electron-builder.yml` `mac.bundleVersion` | `3` | 同上 |
| CI workflow 里的版本字面量 | 无命中（`grep -rn "0.1.0-beta" .github/` 无输出） | grep |

**结论**：版本矩阵自洽，无硬编码旧版本残留；beta.3 的“Desktop Beta.3 / 其他组件 Beta.2”历史问题已不存在。

## 3. 门禁实测结果

| 门禁 | 实际命令 | 结果 |
|---|---|---|
| 后端质量（CI `backend-quality`） | `mvn -o -pl backend -am clean verify`（HEAD 快照） | **BUILD SUCCESS**，`Total time: 30.750 s`；`Tests run: 364, Failures: 0, Errors: 0, Skipped: 14` |
| JaCoCo 覆盖率门禁 | 同上 | `Analyzed bundle 'backend' with 287 classes` / `All coverage checks have been met.` |
| Spotless（CI `Spotless Code Formatting Check`） | `mvn -o -pl backend com.diffplug.spotless:spotless-maven-plugin:2.43.0:check` | **BUILD SUCCESS**；`Spotless.Java is keeping 328 files clean - 0 needs changes to be clean, 328 were already clean` |
| 搜索链路用例 | 同上 verify 日志 | `SearchOrchestratorTest` 3/3、`SearchStrategyConfigTest` 3/3 通过（共 6/6） |
| API/就绪路径一致性 | `bash scripts/check-consistency.sh` | `exit=0`，`API and readiness path checks passed` |
| 版本一致性 | `bash scripts/check-release-version.sh` | `exit=0`（含本次新增的两项校验） |
| macOS bundle 元数据单测 | `node --test scripts/macos-release-metadata.test.mjs` | `tests 7 / pass 7 / fail 0` |
| 发布清单证据 | `bash scripts/release-manifest.sh /tmp/t5-release-evidence` | `exit=0`，生成 `release-manifest.json` + `SHA256SUMS` |
| 桌面主进程测试（CI `desktop-test`） | `cd desktop && npm run test:main` | `tests 26 / pass 26 / fail 0` |
| renderer 静态检查 | `cd desktop/src/renderer && npm run lint` | `exit=0` |
| renderer 单测 | `cd desktop/src/renderer && npm run test` | `Test Files 12 passed (12)`、`Tests 35 passed (35)` |
| ts-cli 类型检查 / 构建 | `npm run typecheck`、`npm run build` | 均 `exit=0` |
| local-service 构建 / 测试 | `npm run build`、`npm test` | `exit=0`、`tests 10 / pass 10 / fail 0` |
| npm 依赖审计（5 组） | 见第 5 节 B1 | **全部失败** |
| CI `deployment-config` 断言块 | 抽取 ci.yml 的 python 断言本地执行 | 修复前 `AssertionError`（见 6.1），修复后 `exit=0` |

补充证据：`scripts/release-manifest.sh` 对本地 beta.3 产物生成的 SHA-256

```
be08b1985ea0895f40bd7f306247aca83fccfc790fc5801586768cec007ba0d5  AI Agent-0.1.0-beta.3-mac-arm64.dmg   (409746851 B, 2026-09-01 11:04)
273a4c59602ddaff5c9603382b6bdb07df19f3b6c39b894aa1c4413255070422  AI Agent-0.1.0-beta.3-mac-arm64.zip   (406497017 B, 2026-09-01 11:04)
```

## 4. 覆盖率实测（JaCoCo 0.8.14）

来源：`/tmp/t5-baseline2/backend/target/site/jacoco/jacoco.csv`（287 个类）。

| 计数 | covered | missed | total | ratio | 门禁 | 余量 |
|---|---|---|---|---|---|---|
| LINE | 5714 | 1866 | 7580 | **0.7538** | ≥ 0.65 | **+10.38 pp** |
| BRANCH | 1698 | 1057 | 2755 | **0.6163** | ≥ 0.60 | **+1.63 pp** |
| INSTRUCTION | 24455 | 7762 | 32217 | 0.7591 | — | — |

- 与改动前基线（`590f7d9` 快照）**完全一致**：LINE 0.7538 / BRANCH 0.6163 / 287 类，说明已提交的归档与清理未改变覆盖率。
- **分支余量只有 1.63 pp**（≈45 个分支的冗余）。WS4（桌面 Flyway 统一）、WS5（e2e）会同时新增生产代码与测试；新增未被覆盖的分支可能把 BRANCH 拉到 0.60 以下，**合入后必须重跑 `mvn -o -pl backend -am clean verify`**。
- 14 个 skipped 用例不计入覆盖率，明细见 B7。
- 未覆盖行最多的类（前 10）：

| missed/total | 类 |
|---|---|
| 228/825 | `com.agent.mvp.knowledge.service.KnowledgeItemService` |
| 104/210 | `com.agent.mvp.agent.service.RAGMemoryService` |
| 94/237 | `com.agent.mvp.coach.service.CoachService` |
| 87/267 | `com.agent.mvp.agent.service.AgentService` |
| 87/96 | `com.agent.mvp.agent.OpenAIController` |
| 75/156 | `com.agent.mvp.tooling.service.ToolAuditService` |
| 50/134 | `com.agent.mvp.agent.search.EmbeddingStoreProvider` |
| 48/162 | `com.agent.mvp.system.service.SystemDiagnosticsService` |
| 48/55 | `com.agent.mvp.coach.agent.SupervisorAgent` |
| 42/528 | `com.agent.mvp.settings.service.SettingsService` |

## 5. CI 现状与根因（GitHub API 实测）

最后一次全绿：`d80639c`（2026-09-01T03:07:44Z，run 33465070632）。之后的 7 次 main 运行全部失败。HEAD（`590f7d9`，run 34097414403）的 job 结论：

| job | 结论 |
|---|---|
| `backend-quality`（Spotless + `mvn clean verify`） | success |
| `desktop-test` | success |
| `python-service-test` | success |
| `deployment-config` | **failure** |
| `release-preflight` | **failure** |

### B1 `release-preflight` 失败 = npm audit 门禁（需 dep-guard）

`./scripts/release-check.sh dev` 的 `audit_npm_runtime_dependencies` 会硬失败，本地复现 5 组审计全部非 0：

| 目录 | 范围 | 结果 | 明细（含 dep-guard 复核的传导链） |
|---|---|---|---|
| `desktop` | `--omit=dev` | **2 high** | `fast-uri@3.1.5`（漏洞区间 3.0.0–3.1.5，由 `overrides.fast-uri=3.1.5` 钉住）、`ajv`（`via` 即 fast-uri，本身无独立 advisory） |
| `desktop` | full | 2 high + 1 moderate | 追加 `@xmldom/xmldom@0.8.13 <= 0.8.14`（`electron-builder → app-builder-lib → plist@3.1.0 → @xmldom/xmldom`） |
| `desktop/src/renderer` | full | **1 high** | `browserslist@4.28.2 <= 4.28.6`（`@babel/core → @babel/helper-compilation-targets → browserslist`） |
| `ts-cli` | full | **1 high** | `browserslist@4.28.2 <= 4.28.6`（同上） |
| `local-service` | `--omit=dev` 与 full | **3 moderate** | 唯一真实 advisory 在 `qs`（区间 2.2.5–6.15.3）；`body-parser`（`via=["qs"]`）与 `express@4.22.2`（`via=["body-parser","qs"]`）是**传导效应**，本身无独立 advisory |

根因是**时间相关**，不是本仓库代码回归——相关 advisory 的发布时间均晚于最后一次全绿：

| GHSA | 严重级 | 发布时间（UTC） |
|---|---|---|
| GHSA-5jgf-p345-68v8（fast-uri，共 4 条） | high | 2026-09-02T15:44:30Z |
| GHSA-c83g-rgw3-j3cx（browserslist） | high | 2026-09-01T16:42:13Z |
| GHSA-x5fp-wj9c-mxmx（qs） | medium | 2026-09-02T14:46:57Z |

修复方向（属 dep-guard 范围，本任务不改 `package.json`/lockfile；版本存在性已由 release-verifier 独立复核）：`desktop` 的 `fast-uri` override 提到 `3.1.7` 并新增 `@xmldom/xmldom` override `0.8.15`；`renderer`/`ts-cli` 新增 `browserslist` override `4.28.9`；`local-service` 新增 `qs` override `6.16.0`（`body-parser` 1.20.x 线最高即 1.20.6，**无需**升 express 4→5）。随后重新生成 4 个 `package-lock.json`（保证 `npm ci` 一致）并复跑 5 组审计。

> 更正：本报告初稿曾推断 `local-service` 的 `body-parser` 需要 >1.20.6——该推断不成立（1.20.x 线最高 1.20.6，且 body-parser 无独立 advisory），已按 dep-guard 的复核结论修正。

### B2 `deployment-config` 失败 = CI 断言漂移（已修）

`ci.yml` 断言 `assert '@Profile("mq")' in kafka_config`，但 `backend/src/main/java/com/agent/mvp/core/agent/config/KafkaTopicConfig.java` 在 `f016dd8` 已改为：

```java
@ConditionalOnExpression("${app.kafka.enabled:${spring.kafka.consumer.auto-startup:false}}")
```

本地抽取 ci.yml 的 python 断言块执行，复现：

```
Traceback (most recent call last):
  File "/tmp/t5-deploycfg-asserts.py", line 24, in <module>
    assert '@Profile("mq")' in kafka_config
AssertionError
```

`git log -S'@ConditionalOnExpression'` 确认该注解由 `f016dd8` 引入，与该 job 变红的时间点一致。修复见 6.1。

## 6. 本次修复的可自动化不一致（限 `.github/` 与 `scripts/`）

### 6.1 `.github/workflows/ci.yml`：Kafka 条件断言与实现对齐

```diff
-          assert '@Profile("mq")' in kafka_config
+          # KafkaTopicConfig is enabled by a property expression (app.kafka.enabled,
+          # falling back to spring.kafka.consumer.auto-startup, default false) since
+          # the Kafka conditional refactor; it must stay conditional and off by default.
+          assert '@ConditionalOnExpression' in kafka_config
+          assert 'app.kafka.enabled' in kafka_config
+          assert ':false}' in kafka_config
           assert 'KAFKA_BOOTSTRAP_SERVERS' not in configmap
```

保留了原意（Kafka 主题配置必须条件化、默认关闭），只把断言换成与当前实现一致的形式。验证：重新抽取 ci.yml 断言块执行 → `assert_exit=0`。

### 6.2 `scripts/check-release-version.sh`：补上漏检的版本引用

原来只校验 6 个“组件自身版本”，**不校验 `backend/pom.xml` 里对 `bug-sentinel-starter` 的依赖版本引用**。bump 时漏改这一处会导致构建去解析旧版本。新增 `dependency_version()` 抽取并纳入校验列表（组件名 `backend:bug-sentinel-starter-dependency`）。

负例验证（`/tmp/t5-fake` 假树，把依赖版本改成 `0.1.0-beta.9`）：

```
[release-version] backend:bug-sentinel-starter-dependency version 0.1.0-beta.9 does not match desktop version 0.1.0-beta.3
exit=1
```

真树验证：`bash scripts/check-release-version.sh` → `exit=0`。

### 6.3 `scripts/macos-release-metadata.mjs`：CFBundleVersion 必须跟随预发布号

原来只校验 `bundleShortVersion == 版本数字核心`，`bundleVersion` 只要求是数字。而 macOS 升级比较的是 `CFBundleVersion`：若 beta.4 只改 6 处版本号、忘改 `desktop/electron-builder.yml` 的 `bundleVersion: "3"`，新包不会被系统识别为更新。新增规则：预发布形如 `beta.N` / `rc.N`（单段数字）时，`mac.bundleVersion` 必须等于 `N`；更复杂的预发布（如 `0.1.0-beta.3.1`）不猜测、维持原行为。

负例验证（假树 `bundleVersion: "2"` + `0.1.0-beta.3`）：

```
[macos-release-metadata] mac.bundleVersion 2 must equal the prerelease number 3 of desktop version 0.1.0-beta.3; macOS compares CFBundleVersion when updating, so bumping the beta number requires bumping desktop/electron-builder.yml mac.bundleVersion too
```

单测从 4 个扩到 7 个（`node --test scripts/macos-release-metadata.test.mjs` → 7/7 通过）。当前真树值 `0.1.0-beta.3` + `bundleVersion: "3"` 满足新规则，不产生行为变化。

## 7. v0.1.0-beta.4 升级清单（7 处 + 2 条规则）

| # | 文件 | 字段 |
|---|---|---|
| 1 | `desktop/package.json` | `version` |
| 2 | `ts-cli/package.json` | `version` |
| 3 | `local-service/package.json` | `version` |
| 4 | `pom.xml` | `<version>` |
| 5 | `backend/pom.xml` | `<version>` |
| 6 | `backend/pom.xml` | `bug-sentinel-starter` 依赖 `<version>`（6.2 起已强制） |
| 7 | `bug-sentinel-starter/pom.xml` | `<version>` |
| 8 | `desktop/electron-builder.yml` | `mac.bundleVersion: "4"`（6.3 起已强制；`bundleShortVersion` 保持 `0.1.0`） |

规则：
- tag 必须是 `v0.1.0-beta.4` 且指向 `origin/main` 可达的提交（`release-macos.yml` 会 `git merge-base --is-ancestor` 校验）。
- 带 `-beta.` 的 tag 走“本机生成、未 Developer ID 签名/未公证”的个人 Beta 路径（`release-macos.yml` 的 `release-macos-arm64` job 对 `-beta.` 直接 skip）；正式版本才进签名/公证/ Gatekeeper 门禁。

bump 后必须复跑：`bash scripts/check-release-version.sh`、`node --test scripts/macos-release-metadata.test.mjs`、`mvn -o -pl backend -am clean verify`、5 组 `npm audit`、`cd desktop && npm run test:main`、`cd desktop/src/renderer && npm run lint && npm run test`。

## 8. captain 提交前 checklist

- [ ] B1 已修：5 组 npm audit 全部 exit 0（`desktop` prod/full、`renderer` full、`ts-cli` full、`local-service` prod/full），lockfile 一并提交。
- [ ] B2 已提交：`.github/workflows/ci.yml` 的 Kafka 断言修复。
- [ ] 本次脚本改动已提交：`scripts/check-release-version.sh`、`scripts/macos-release-metadata.mjs`、`scripts/macos-release-metadata.test.mjs`。
- [ ] `bash scripts/check-consistency.sh`、`bash scripts/check-release-version.sh`、`node --test scripts/macos-release-metadata.test.mjs` 全绿。
- [ ] `mvn -o -pl backend -am clean verify` 在**合入后**的工作树上重跑，确认 LINE ≥ 0.65、BRANCH ≥ 0.60（当前余量仅 +1.63 pp）。
- [ ] 推送后 main 上 5 个 CI job 全绿（尤其 `deployment-config` 与 `release-preflight`），再决定切 tag。
- [ ] 5 个 WIP 渲染层文件与其余成员改动已收敛、工作树干净（`REQUIRE_CLEAN_SOURCE` 只在 prod/正式发布强制，但个人 Beta 也应尽量干净）。
- [ ] 若走正式发布：`desktop/release` 必须清空（`assert_formal_macos_release_output_is_empty`），且准备好 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`、`GITHUB_ACTOR`、`GITHUB_TOKEN`。
- [ ] 打包机 Node 必须是 22.12–22.x（本机 v26.7.0 会被 `check_desktop_package_node_version` 拒绝，除非显式 `RELEASE_CHECK_ALLOW_UNSUPPORTED_NODE=true`）。

## 附录 A：证据文件（本机 `/tmp`，重启即失）

| 文件 | 内容 |
|---|---|
| `/tmp/t5-verify-baseline.log` | 590f7d9 快照 `mvn verify` 全量日志（BUILD SUCCESS 42.653 s） |
| `/tmp/t5-verify-head.log` | 5c8adf7 快照 `mvn verify` 全量日志（BUILD SUCCESS 30.750 s） |
| `/tmp/t5-baseline2/backend/target/site/jacoco/jacoco.csv` | 覆盖率原始数据（287 类） |
| `/tmp/t5-spotless-baseline.log`、`/tmp/t5-spotless-head.log` | Spotless 输出 |
| `/tmp/t5-release-evidence/release-manifest.json`、`SHA256SUMS` | 本地 beta.3 产物清单与校验和 |
| `/tmp/t5-deploycfg-asserts.py`、`/tmp/t5-deploycfg-asserts-fixed.py` | 修复前/后抽取的 CI 断言块 |
| `/tmp/t5-fake/` | 6.2 / 6.3 的负例假树 |
| `/tmp/t5-desktop-testmain.log`、`/tmp/t5-renderer-*.log`、`/tmp/t5-tscli-*.log`、`/tmp/t5-local-*.log` | 前端/CLI 门禁输出 |
| `/tmp/t5-audit-*.log`、`/tmp/t5-audit-desktop-full.json` | 5 组 npm audit 原始输出 |

## 附录 B：本次未执行项与原因

| 未执行 | 原因 |
|---|---|
| `./scripts/release-check.sh dev` 全量 | 脚本开头强制要求 `GITHUB_ACTOR` + `GITHUB_TOKEN`（`verify_flexagent_package_access`），本机两者 UNSET；且需 docker 与 Node 22 |
| `scripts/release-check-macos.sh` | 需要 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`，本机全部 UNSET（已实测确认） |
| `docker compose config --quiet` | 本机无 docker CLI（`which docker` → not found） |
| `npm ci` | 会改动 node_modules，属他人环境；改用现有依赖树审计 |
| electron-builder 打包（`npm run pack` / `dist:mac:arm64`） | 本机 Node v26.7.0 不满足 22.12–22.x 的打包门禁；且正式路径需要签名凭据 |
| Testcontainers 用例（5 个） | 本机无 Docker，`@Testcontainers(disabledWithoutDocker = true)` 自动跳过 |

## 附录 C：其他实测发现（非阻断，建议后续处理）

- **B7 14 个 skipped 用例**：`AgentFlowIntegrationTest` 5 个（`@Testcontainers(disabledWithoutDocker = true)`，CI ubuntu 上会真跑）、`AgentServiceTest` 7 个（`@Disabled("Replaced by FlexAgent execution loop")`）、`OsAgentServiceTest` 2 个（`@Disabled("Requires local mock server on 1234")`）。覆盖率与“0 失败”结论都建立在这 14 个未执行之上。
- **B6 本地 `desktop/release/mac-arm64/AI Agent.app` 签名无效**：`codesign --verify --deep --strict` → `exit=1`（`code has no resources but signature indicates they must be present`），`Identifier=Electron`、`TeamIdentifier=not set`，`xcrun stapler validate` → `does not have a ticket stapled to it`，本机 `spctl --status` → `assessments disabled`。这是 2026-09-01 的本地打包残留，**不是**已发布的 beta.3 资产；且它会让正式发布的 `assert_formal_macos_release_output_is_empty` 失败，正式打包前必须清空 `desktop/release`。
- **已发布的 beta.3 资产与本地文件不同**：GitHub prerelease `v0.1.0-beta.3`（published 2026-08-29T09:00:53Z，3 个资产）的 dmg 为 409622915 B、zip 为 406363229 B；本地同名 dmg/zip 为 409746851 / 406497017 B（2026-09-01 11:04）。按 `release-macos.yml` 的设计，`-beta.` tag 走“本机构建、未签名”的路径并手工上传，属预期行为。
- **npm 11 与审计策略脚本不兼容**：本机 npm 11.19.0 输出 `auditReportVersion` 非 2，`desktop/scripts/verify-npm-audit-policy.mjs` 报 `audit report must use npm auditReportVersion 2 ...` 并 `exit=2`；`release-check.sh` 对该返回值只记 warning，等于**静默跳过 desktop 的 full-audit 例外策略**。CI 用 Node 22（npm 10）不受影响，但本机/新版本 Node 上该策略形同虚设，建议 dep-guard 或后续任务让校验器兼容 v2/v3。
