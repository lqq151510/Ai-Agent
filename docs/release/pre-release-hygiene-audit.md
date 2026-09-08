# 发布前安全与卫生审计（Pre-release Hygiene Audit）

- 审计对象：`/Users/liuyongze/Documents/AI-agent`（远程 `https://github.com/lqq151510/Ai-Agent.git`，按**公开仓库**标准）
- 基线：`HEAD = 5c8adf7`（`main`），工作树含其他工作流未提交改动
- 审计时间：2026-09-08 15:51（Asia/Shanghai）
- 审计人：repo-hygiene（WS7 / t9）
- 原则：**只出报告与建议，不删除、不移动任何文件**；需要改动的一律先由 captain 批准
- 复现前缀：所有命令在仓库根执行，`export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"`；`git grep` 只搜 tracked 文件，天然排除 `.git`、`node_modules`、`*/target/*`、`desktop/release*`、`desktop/dist`

## 0. 结论摘要（TL;DR）

| 判断 | 结论 |
| --- | --- |
| 真实凭据是否入库 | **否**。tracked 文件与全部 113 个 commit 历史中只有占位符，无 `sk-` 真值、无 `ghp_`/`github_pat_`/`AKIA`/`AIza`、无私钥块、无 JWT 明文 |
| 是否可安全公开 | **暂不可**。存在 3 类必须先处理项：**学号+真实姓名 PII**、**`artifacts/e2e/` 生成物未忽略**、**28MB 二进制 jar** |
| 仓库体积 | tracked 755 个文件 / 37.1 MB，其中 `tools/plantuml.jar` 27.68 MB（占 75%） |
| 构建脏工作区风险 | 除 `artifacts/e2e/`（与 `backend/artifacts/`）外，其余生成物均已被 `.gitignore` 覆盖 |

## 1. 汇总表

| # | 项目 | 级别 | 命中位置 | 证据命令 | 建议动作 | 需 captain 决策 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | **学生学号（PII）**：`5423072501xx` × 4 人，共 26 处 | **P0** | `artifacts/exp3/exp3_report.tex:91-97`；`scripts/build_course_final_report.py:33-36,344-347`；`scripts/gen_exp2_report.py:111`；`scripts/gen_exp3_report.py:19-22,136-138`；`scripts/generate_docx.py:171,234-237` | `git grep -n -I -E "542307250[0-9]{3}"` | 公开前**必须**移除或脱敏（学号在国内高校常被当作身份凭据）；这 5 个文件都是课程报告生成器/产物，非产品代码，建议整体移出仓库 | 是 |
| A2 | **真实姓名（PII）**：4 人，共 62 处 | **P0** | 同上 5 文件（`exp3_report.tex:99,201-204`、`build_course_final_report.py:24-36,97-100,348,405-407`、`gen_exp2_report.py`、`gen_exp3_report.py`、`generate_docx.py:172,234-237,299,312`） | `git grep -c -I -E "刘勇泽\|李容昊\|梁家诚\|刘洋"` | 与 A1 同批处置 | 是 |
| A3 | **微信 wxid**：`wxid_0s89…` 1 处 | **P1** | `scripts/build_course_final_report.py:25` | `git grep -n -I "wxid_"` | 随 A1/A2 一起移除；该行还含微信容器绝对路径 | 是 |
| A4 | 本机绝对路径 `/Users/liuyongze`：12 文件 / 38 行 | **P1** | `artifacts/exp3/exp3_report.tex`(15)、`knowledge-desk/DESIGN_SPEC.md`(8)、`scripts/build_course_final_report.py`(5)、`docs/arch/001-codex-desktop-alignment.md`(2)、`ts-cli/start-cli.command`(1)、`scripts/generate_docx.py`(1)、`scripts/gen_exp3_report.py`(1)、`reasonix.toml`(1)、`opencode.jsonc`(1)、`docs/superpowers/specs/2026-06-25-knowledge-desk-backend-design.md`(1)、`docs/arch/004-knowledge-desk-api-contract.md`(1)、`.opencode/openwork.json`(1) | `git grep -n -I "/Users/liuyongze"` | 改为相对路径或 `<HOME>`/`<repo>` 占位符；`reasonix.toml`、`opencode.jsonc`、`.opencode/openwork.json` 属个人工具配置，建议移出仓库 | 是 |
| A5 | `泽宝`（个人称呼）作为**生产默认** displayName 2 处 + 测试/文档 10 处 | **P1** | `desktop/src/renderer/src/knowledge-desk/knowledgeDeskApi.ts:1640`（默认值）、`:1946`；`knowledgeDeskApi.degraded.test.js:13`；`backend/.../SettingsServiceTest.java`(5)、`SettingsControllerTest.java:57`；`docs/arch/004-knowledge-desk-api-contract.md:160,178,232` | `git grep -n -I "泽宝"` | 生产默认值建议改为中性值（如 `"用户"`/空串）；captain 已判定属产品决策，本报告只记录 | 是（已判定） |
| B1 | 测试夹具路径 `/Users/ze`、`/Users/zebao`、`/Users/private`：15 处（backend 10 + desktop renderer 5） | **P2** | `backend/.../SourceUriSanitizerTest.java:22`、`KnowledgeReviewServiceTest.java:89,154`、`KnowledgeItemServiceTest.java:189,241,496,506`、`SettingsServiceTest.java:315,360,492`；`desktop/.../knowledgeDeskApi.review.test.js:35`、`knowledgeDeskApi.sources.test.js:37,50,51,81` | `git grep -n -I -E "/Users/[A-Za-z]" \| grep -v "/Users/liuyongze"` | 可保留（脱敏测试的正面用例）；若要极致中性化可改 `/Users/example` | 否 |
| B2 | `host.docker.internal`：10 处 | **P3** | `README.md:151`、`backend/.../OpenAiModelProvider.java:380`、`env/*.env.example`(3)、`scripts/deploy.sh:93`、`scripts/smoke.sh:30,101,135` | `git grep -n -I "host.docker.internal"` | 可忽略：属容器内访问宿主的标准用法与示例 | 否 |
| C1 | 真实密钥入库 | **通过** | — | 见 §2.1 | 无需处理 | 否 |
| C2 | 本地未跟踪 `env/dev.env` 含真实 JWT_SECRET / API key / 内网 IP | **P0（流程风险）** | `env/dev.env:18`（`X4i7…`）、`:25`（`sk-l…`）、`:24`（内网 `10.…`） | `git check-ignore -v env/dev.env` → `.gitignore:20:env/*.env`；`git log --all -- env/dev.env` → 空 | **未入库、未入历史**，无需仓库改动；建议该 JWT_SECRET 若曾用于对外/共享环境则轮换；严禁 `git add -f` | 是（是否轮换） |
| D1 | `tools/plantuml.jar` 27.68 MB 入库 | **P0** | `tools/plantuml.jar` | `git ls-files -z \| xargs -0 ls -la \| awk '$5>1048576'` | 移出仓库 + 提供下载脚本/文档化版本与校验和（草案见 §4） | 是 |
| D2 | 应用图标 `codejoy-icon.icns` 1.55 MB、`codejoy-icon.png` 1.15 MB | **P2** | `desktop/resources/icons/` | 同上 | 可接受（打包必需） | 否 |
| E1 | tracked-but-ignored：`.serena/.gitignore`、`.serena/project.yml` | **P2** | `.gitignore:25:.serena/` | `git ls-files -i -c --exclude-standard` | 建议保留（本地工具配置，无隐私内容） | 否 |
| E2 | tracked-but-ignored：`.trae/documents/desktop-client-plan.md` | **P1** | `.gitignore:7:.trae/` | 同上 | 建议取消跟踪（`git rm --cached`），内容可并入 `docs/arch/` | 是 |
| F1 | **`artifacts/e2e/` 生成物未忽略** | **P0** | `artifacts/e2e/20260908-074930/baseline.json`（由 `backend/.../KnowledgeDeskJourneyE2ETest.java:839,843,845` 写入；cwd 为 `backend/` 时写 `backend/artifacts/e2e`） | `git check-ignore -v --no-index artifacts/e2e/x.json` → 无规则；`git status --porcelain \| grep '^??'` | 追加 `**/artifacts/e2e/` 到 `.gitignore`（可同时覆盖 `backend/artifacts/e2e`） | 是 |
| F2 | 其余生成物已被忽略 | **通过** | `desktop/release`(3.0 GB)、`desktop/dist`(2.7 MB)、`desktop/release-dev`(725 MB)、`desktop/backend-jre`(442 MB)、`artifacts/smoke/*`、`*.log`、`var/coach-artifacts/` | 见 §2.6 | 无需处理 | 否 |

## 2. 分项详情与证据

### 2.1 凭据 / 密钥（S2）

```bash
git grep -n -I -E "sk-[A-Za-z0-9_-]{16,}"                     # 仅占位符
git grep -n -I -E "ghp_[A-Za-z0-9]{20,}|github_pat_|gho_|ghs_" # 空
git grep -n -I -E "AKIA[0-9A-Z]{16}"                          # 空
git grep -n -I -E "AIza[0-9A-Za-z_-]{35}"                     # 空
git grep -n -I -E "BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY" # 空
git grep -n -I -E "eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}" # 空
```

`sk-` 全部命中均为占位符，可直接判为非凭据：

| 位置 | 值 | 判定 |
| --- | --- | --- |
| `backend/.../OpenAiModelProvider.java:365` | `sk-local-mock-placeholder` | 占位符 |
| `backend/.../KnowledgeOrganizerService.java:240` | `sk-local-placeholder` | 占位符 |
| `backend/.../ModelSourceProbeService.java:257` | `sk-local-placeholder` | 占位符 |
| `backend/src/test/resources/application-test.yml:76` | `sk-test-placeholder` | 占位符 |
| `scripts/run-macos-local.sh:83` | `sk-local-mac-desktop` | 占位符 |
| `backend/.../AgentContextServiceTest.java:68` | `sk-1234567890abcdef` | 测试假串（红action 用例输入） |

其它凭据面：

```bash
grep -n "password" .mvn/settings.xml            # -> <password>${env.GITHUB_TOKEN}</password>
grep -rn -E "(token|password|secret|key)[[:space:]]*[:=][[:space:]]*[^$[:space:]]{8,}" .github/workflows/*.yml  # 空
grep -c "secrets\." .github/workflows/*.yml     # ci.yml:4, release-macos.yml:12
grep -n -E "appleId|appleIdPassword|CSC_|APPLE_" desktop/electron-builder.yml   # 仅注释，凭据走环境变量
for f in env/*.example; do grep -n -E "^(JWT_SECRET|POSTGRES_PASSWORD|OPENAI_API_KEY|.*TOKEN.*)=" "$f"; done  # 全部 replace-…/change-me/inject-…
git grep -n -I -E "://[^/[:space:]\"']+:[^/@[:space:]\"']+@"   # 仅 user:password@8.8.8.8 / @127.0.0.1 测试夹具
```

历史扫描（113 个 commit 全覆盖）：

```bash
git rev-list --count --all                                      # 113
git grep -n -I -E "sk-[A-Za-z0-9_-]{20,}|ghp_|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY" $(git rev-list --all)  # 仅占位符
git log --all --oneline -- env/dev.env                          # 空（从未提交）
git log --all --pretty=format: --name-only --diff-filter=A | sort -u | grep -E "(^|/)\.env"  # 空
```

> 本地 `env/dev.env`（未跟踪、已忽略）含真实 JWT_SECRET（`:18`，前缀 `X4i7`）与 LM Studio API key（`:25`，前缀 `sk-l`）以及内网地址（`:24`，`10.…`）。**不在仓库、不在历史**；已单独以 `文件:行 + 前缀4位` 形式报 captain，本报告不写明文。

### 2.2 本机绝对路径泄漏（S1）

```bash
git grep -l -I "/Users/liuyongze" | wc -l        # 12
git grep -c -I "/Users/liuyongze" | awk -F: '{s+=$2} END {print s}'   # 38
git grep -n -I -E "/Users/[A-Za-z]" | grep -v "/Users/liuyongze"      # /Users/ze、/Users/zebao、/Users/private 测试夹具 15 处
git grep -n -I "host.docker.internal"                                 # 10 处（示例/脚本，可忽略）
```

高价值命中（需处理）：

- `artifacts/exp3/exp3_report.tex:405-695`：15 处 `\includegraphics{/Users/liuyongze/...}`
- `knowledge-desk/DESIGN_SPEC.md:44-53`：8 处页面/组件绝对路径
- `scripts/build_course_final_report.py:19-27`：课程报告路径（含微信容器路径与 wxid）
- `docs/arch/001-codex-desktop-alignment.md:592-593`：sandbox 规则里的绝对路径
- `ts-cli/start-cli.command:2`、`reasonix.toml:55`、`opencode.jsonc:15`、`.opencode/openwork.json:9`、`docs/superpowers/specs/...:432`、`docs/arch/004-...:432`、`scripts/generate_docx.py:774`、`scripts/gen_exp3_report.py:15`

### 2.3 个人信息（S3）

```bash
git grep -n -I -E "542307250[0-9]{3}"                        # 26 处 / 5 文件（学号）
git grep -c -I -E "刘勇泽|李容昊|梁家诚|刘洋"                 # 62 处 / 5 文件（姓名）
git grep -n -I "wxid_"                                       # 1 处
git grep -n -I "泽宝"                                        # 12 处 / 5 文件
git grep -n -I -E "2005年08月15日|2005-08-15|0815"            # 空
git grep -n -I -E "(^|[^0-9])1[3-9][0-9]{9}([^0-9]|$)"        # 空（无手机号）
git grep -n -I -E "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" | grep -v -E "@Test|@Value|..."  # 仅 package-lock.json 中 npm 作者邮箱
```

- **学号 + 姓名是本仓库最严重的隐私项**：4 位真实同学的全名与学号同时出现在 `artifacts/exp3/exp3_report.tex`、`scripts/build_course_final_report.py`、`scripts/gen_exp2_report.py`、`scripts/gen_exp3_report.py`、`scripts/generate_docx.py`。这 5 个文件均为课程报告生成器/产物，与 Knowledge Desk 产品主线无关。
- `泽宝` 的 2 处生产默认值在 `desktop/src/renderer/src/knowledge-desk/knowledgeDeskApi.ts:1640,1946`（captain 已判定为产品决策，仅记录）。

### 2.4 大文件 / 二进制入库（S4）

```bash
git ls-files -z | xargs -0 ls -la | awk '$5>1048576 {printf "%.2f MB\t%s\n", $5/1048576, $9}' | sort -rn
# 27.68 MB  tools/plantuml.jar
#  1.55 MB  desktop/resources/icons/codejoy-icon.icns
#  1.15 MB  desktop/resources/icons/codejoy-icon.png
git ls-files -z | xargs -0 ls -la | awk '{s+=$5} END {printf "%.1f MB / %d files\n", s/1048576, NR}'   # 37.1 MB / 755
ls -la .gitattributes   # 不存在：仓库未配置 Git LFS
```

### 2.5 tracked-but-ignored（S5）

```bash
git ls-files -i -c --exclude-standard        # 3 个文件
git check-ignore -v --no-index .serena/project.yml
# .gitignore:25:.serena/   .serena/project.yml
git check-ignore -v --no-index .trae/documents/desktop-client-plan.md
# .gitignore:7:.trae/       .trae/documents/desktop-client-plan.md
git check-ignore -v --no-index .claude/skills/harness/SKILL.md   # 无规则 -> 正常跟踪，无需处理
```

> 注意：`git check-ignore` 默认跳过已被跟踪的路径，必须加 `--no-index` 才能看到命中规则。

### 2.6 生成物是否被忽略（S6）

```bash
for p in desktop/release desktop/dist desktop/backend-jre desktop/release-dev \
         artifacts/smoke/dev/x var/coach-artifacts/ logs/application.log backend/logs/application.log \
         backend/artifacts artifacts/e2e; do printf "%-30s -> " "$p"; git check-ignore -v --no-index "$p" || echo "NOT IGNORED"; done
```

| 路径 | 磁盘大小 | 忽略规则 | 判定 |
| --- | --- | --- | --- |
| `desktop/release` | 3.0 GB | `.gitignore:51` | ✅ |
| `desktop/release-dev` | 725 MB | `.gitignore:52` | ✅ |
| `desktop/backend-jre` | 442 MB | `.gitignore:53` | ✅ |
| `desktop/dist` | 2.7 MB | `.gitignore:50` | ✅ |
| `artifacts/smoke/*/` | 324 KB | `.gitignore:38` | ✅ |
| `logs/`、`backend/logs/` | 148 KB / 2.7 MB | `.gitignore:23 (*.log)` | ✅（仅 `.log`；非 `.log` 文件不会被忽略） |
| `var/coach-artifacts/` | 不存在 | `.gitignore:61` | ✅ |
| **`artifacts/e2e/`** | 4 KB（`20260908-074930/baseline.json`） | **无** | ❌ 需补规则 |
| **`backend/artifacts/`** | 不存在（曾出现） | **无** | ❌ 同规则覆盖 |

```bash
git clean -ndX | wc -l      # 48 条被忽略项（干跑，未删除任何文件）
git status --porcelain | grep '^??'   # 未跟踪且未忽略项 = artifacts/e2e/ + 队友新增源码/文档
```

## 3. 三档处置清单

### 3.1 发布前必须处理（P0）

1. **学号 + 姓名 + wxid（A1/A2/A3）** —— **转用户决策**（captain 2026-09-08 裁决：涉及第三方隐私与课程材料，不擅自处置）。执行器已就绪且**只做 dry-run**：`scripts/sanitize-course-materials.sh`（方案与实测见 §5）。
2. **`artifacts/e2e/` 未被忽略（F1）** —— ✅ **captain 已执行**：`.gitignore:71` 新增 `**/artifacts/e2e/`；`git check-ignore -v --no-index artifacts/e2e/x.json backend/artifacts/e2e/x.json` 均命中该规则。
3. **`tools/plantuml.jar` 27.68 MB（D1）** —— 只保留方案，**转用户决策**，未执行（草案见 §4）。
4. **`env/dev.env` 真实密钥（C2）** —— 仓库侧无需改动（未跟踪/未入历史）；是否轮换由用户决定，严禁 `git add -f env/dev.env`。
5. **P1 项（A4 `/Users/liuyongze` 38 行、A5 `泽宝` 默认值）** —— captain 裁决**本轮不修**，转用户决策。

### 3.2 建议处理（P1）

5. `/Users/liuyongze` 12 文件 / 38 行（A4）：改相对路径或占位符；个人工具配置（`reasonix.toml`、`opencode.jsonc`、`.opencode/openwork.json`）建议移出仓库。
6. `泽宝` 生产默认 displayName（A5）：`knowledgeDeskApi.ts:1640,1946` 改中性值（产品决策，captain 已判定）。
7. `.trae/documents/desktop-client-plan.md`（E2）：取消跟踪，内容并入 `docs/arch/`。

### 3.3 可忽略（P2/P3）

8. `/Users/ze`、`/Users/zebao`、`/Users/private` 测试夹具（B1）：15 处（backend 10 + desktop renderer 5），属脱敏测试的正面用例，保留即可。
9. `host.docker.internal`（B2）：容器访问宿主的标准示例。
10. 应用图标 1.55/1.15 MB（D2）：打包必需。
11. `.serena/*`（E1）：本地工具配置，保留。

## 4. `tools/plantuml.jar` 移出方案（草案，未执行）

1. `git rm --cached tools/plantuml.jar`（保留本地文件）并在 `.gitignore` 增加 `tools/*.jar`。
2. 新增 `scripts/fetch-plantuml.sh`：按固定版本号从官方发布地址下载到 `tools/`，校验 SHA-256，失败即退出；版本与校验和写进脚本头部注释。
3. `uml/` 生成流程文档（`uml/` 下的 `.puml`）改为先跑 `scripts/fetch-plantuml.sh`，缺失时给出明确报错与下载命令。
4. 历史瘦身（可选、高风险）：`git filter-repo` 或 BFG 清除历史中的 jar 体积；仅在确认要公开时执行，且需要全队冻结分支。

## 5. 课程材料 PII 处置方案（待用户批准，未执行）

**状态**：captain 已裁决「不擅自处置，转用户决策」；本节只提供可复现方案与执行器，**尚未执行任何处置**（脚本默认 dry-run，本次也只跑了 dry-run）。

### 5.1 执行器

`scripts/sanitize-course-materials.sh`（新增，361 行；**不硬编码任何真实姓名/学号**）

```bash
# 预览（不改任何文件）——默认 move 策略
bash scripts/sanitize-course-materials.sh
# 预览脱敏策略
bash scripts/sanitize-course-materials.sh --mode=redact
# 真执行（需用户明确批准后）
bash scripts/sanitize-course-materials.sh --mode=move   --apply
bash scripts/sanitize-course-materials.sh --mode=redact --apply --dest=~/backup
```

| 策略 | 行为 | 回滚 |
| --- | --- | --- |
| `move`（默认） | 每个命中文件先 `git rm --cached`（保留工作区副本）→ `mv` 到 `--dest`（默认 `~/ai-agent-course-materials-archive/<时间戳>/`）→ 写 `MANIFEST-<ts>.txt` | `mv` 回原路径 + `git add` |
| `redact` | 先 `cp -a` 备份到 `--dest/backup/`，再原地替换：学号 → `XXXXXXXXXXX1..N`（等长，tex/docx 安全）、姓名 → `同学A..D`、wxid → `wxid_REDACTED` | `cp -a <dest>/backup/. .` |

### 5.2 自动检测结果（dry-run 实测，2026-09-08 15:57）

- 待处理值：学号 4 个、姓名 4 个、wxid 1 个（输出一律打码）
- 命中文件 5 个：`artifacts/exp3/exp3_report.tex`、`scripts/build_course_final_report.py`、`scripts/gen_exp2_report.py`、`scripts/gen_exp3_report.py`、`scripts/generate_docx.py`
- 替换量：学号 32 处、姓名 107 处、wxid 1 处
- dry-run 前后 5 个文件 md5 完全一致（未修改任何文件）

### 5.3 安全设计

- **默认 dry-run**；`--apply` 是唯一会改动文件的开关。
- **不硬编码真实值**：学号/姓名/wxid 均在运行时从目标文件派生（来源：`学生姓名：…` 标签行 + `("姓名", "学号")` 元组 + `--extra-names`），脚本本身不会成为新的 PII 载体。
- 学号正则带数字边界 `(?<![0-9])5[0-9]{11}(?![0-9])`：首版用 `5[0-9]{11}` 会误报 32 位 JWT 测试密钥里的 12 位片段（`JwtServiceTest`、`AgentFlowIntegrationTest`、`StartupValidationRunnerTest` 共 3 个文件），已修复并复测为 0 误报。
- 预览默认打码（`542307**`、`刘勇**`、`wxid_0**`），`--show-values` 才显示原值。
- 备份/移出目录固定在**仓库外**（`$HOME/...`），不污染工作区；脚本不执行任何 `git commit/push/tag`。

### 5.4 待用户决策

1. 选 `move`（把课程材料整体移出公开仓库）还是 `redact`（保留文件、脱敏后入库）？前者最干净，后者保留可读性。
2. 若选 `move`：默认目标目录 `~/ai-agent-course-materials-archive/` 是否可接受？
3. **历史提交同样含这些学号/姓名**：公开前是否做历史重写（`git filter-repo`）？会改写全部 commit hash，需全队冻结分支后执行，本方案不含该步骤。
4. 是否连带处理 A4 的本机绝对路径（captain 已裁决本轮不修）；wxid 已包含在本脚本内。

## 6. captain 提交前 checklist

- [ ] PII 处置已决定并执行（A1/A2/A3）：用户选定 `move`/`redact` 后跑 `bash scripts/sanitize-course-materials.sh --mode=<...> --apply`（方案见 §5）
- [ ] `.gitignore` 增补 `**/artifacts/e2e/`（F1）——批准后我可执行
- [ ] `tools/plantuml.jar` 处置已决定（D1）
- [ ] `泽宝` 默认值处置已决定（A5）
- [ ] `env/dev.env` 是否需要轮换已确认（C2），且提交前不执行 `git add -f`
- [ ] 提交前复跑：
  ```bash
  export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
  git status --porcelain
  git grep -n -I -E "542307250[0-9]{3}|刘勇泽|李容昊|梁家诚|刘洋"        # 期望：空
  git grep -n -I "/Users/liuyongze"                                      # 期望：空或仅占位符
  git grep -n -I -E "sk-[A-Za-z0-9_-]{20,}|ghp_|github_pat_|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY"  # 期望：空
  git ls-files -i -c --exclude-standard                                  # 期望：仅 .serena/*（若 E2 已处理）
  git ls-files -z | xargs -0 ls -la | awk '$5>1048576'                   # 期望：无 jar
  git clean -ndX | wc -l                                                 # 忽略项数量，确认无新增生成物漏网
  ```
- [ ] 确认 5 个 WIP 渲染层文件（`KnowledgeDeskApp.tsx`、`knowledge-desk.css`、`knowledgeDeskAssistant.tsx`、`knowledgeDeskScreens.tsx`、`styles/tokens.css`）的改动是否随本次发布一起提交

## 7. 局限与未覆盖

- 本审计只读、未执行任何删除/移动/`git add`/`commit`；所有"建议动作"都需 captain 批准后另开执行。
- 未做：二进制文件内部字符串扫描（`.icns`/`.png`/`.pdf` 中可能嵌入路径或作者信息）；Git 历史对象级体积分析（仅统计当前 tracked 文件）；CI 密钥轮换状态；GitHub 仓库侧的 Secret scanning / Dependabot 配置。
- 未做（建议后续）：对 `artifacts/exp3/*.pdf`、`artifacts/exp3/media/*.png` 做 EXIF/元数据检查（课程报告 PDF 常含作者名）。
- 工作树中其他工作流的未提交改动（`README.md`、`PROJECT_MEMORY.md`、`backend/pom.xml`、5 个 WIP 渲染层文件、新增测试与文档）不在本次审计的"已入库"判定范围内。
