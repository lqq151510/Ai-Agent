# 离线 / 无 Token 构建：FlexAgent 依赖说明

适用范围：`backend` 模块的 `org.flexagent:flexagent-langchain4j` 依赖。该依赖托管在 GitHub
Packages（私有源），需要凭据才能下载，因此"干净机器 + 没有 `GITHUB_TOKEN`"会直接卡在依赖解析。

本文给出三种场景的可复制命令、验证方式与期望输出。**三种场景都不要求修改依赖坐标或版本。**

- 相关脚本：[`scripts/check-offline-build.sh`](../scripts/check-offline-build.sh)
- 相关配置：`backend/pom.xml`（依赖坐标 + 仓库声明）、`.mvn/settings.xml`（环境变量占位符）
- 相关文档：`README.md` 的 "Docker Services" 一节（BuildKit + secret 的容器化构建方式）

## 1. 事实基线

| 项 | 值 |
| --- | --- |
| 依赖坐标 | `org.flexagent:flexagent-langchain4j:1.2.0` |
| 传递依赖 | `org.flexagent:flexagent-core:1.2.0`（同版本，**必须同时缓存**，否则离线解析仍失败） |
| 仓库声明 | `backend/pom.xml` → `<repository><id>github</id><url>https://maven.pkg.github.com/lqq151510/flexagent</url>` |
| 版本来源 | `backend/pom.xml` → `<flexagent.version>1.2.0</flexagent.version>` |
| 本机工具链（实测） | Apache Maven 3.9.9、JDK 21.0.10（`/Users/liuyongze/java/jdk-21.0.10.jdk/Contents/Home`） |
| 本机凭据状态（实测） | `~/.m2/settings.xml` **不存在**；仓库内 `.mvn/settings.xml` 使用 `${env.GITHUB_ACTOR}` / `${env.GITHUB_TOKEN}` 占位符 |
| 本机缓存状态（实测） | `~/.m2/repository/org/flexagent/flexagent-langchain4j/1.2.0/` 与 `.../flexagent-core/1.2.0/` 均有 `*.jar` + `*.pom` |

因此**本机走场景 B**（无 token，但本地 m2 已有缓存）；CI 走场景 A；干净新机器若两者都没有，
会命中场景 C 描述的失败。

## 2. 先判断自己在哪个场景

```bash
# 有 token 吗？（两条命令任一有输出即算有凭据配置）
ls -l ~/.m2/settings.xml 2>/dev/null
grep -c 'GITHUB_TOKEN' .mvn/settings.xml 2>/dev/null

# 本地缓存有吗？（应列出 1.2.0 目录内容）
ls -1 ~/.m2/repository/org/flexagent/flexagent-langchain4j/1.2.0/ 2>/dev/null
```

| 有 token | 有本地缓存 | 走哪个场景 |
| --- | --- | --- |
| 是 | 任意 | 场景 A（可联网解析；缓存命中时更快） |
| 否 | 是 | 场景 B（`mvn -o` 离线构建） |
| 否 | 否 | 场景 C（必须先补齐缓存或凭据，见下） |

一键自检：`bash scripts/check-offline-build.sh`（见第 6 节）。

## 3. 场景 A：有 GitHub Packages token

### 3.1 准备 token

GitHub → Settings → Developer settings → Personal access tokens：

- classic token：勾选 **`read:packages`**
- fine-grained token：`Packages: Read` 权限
- 若组织启用了 SAML SSO，需要额外为该 token 授权 SSO

### 3.2 写入 `~/.m2/settings.xml`（可复制）

`<id>` 必须与 `backend/pom.xml` 里 `<repository><id>github</id>` 完全一致，否则 Maven 不会把
凭据用在这个仓库上。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 https://maven.apache.org/xsd/settings-1.0.0.xsd">
    <servers>
        <server>
            <id>github</id>
            <username>YOUR_GITHUB_USERNAME</username>
            <password>YOUR_READ_PACKAGES_TOKEN</password>
        </server>
    </servers>
</settings>
```

`chmod 600 ~/.m2/settings.xml`。**不要把 token 提交进仓库**。

### 3.3 不想落盘：用仓库内的占位符 settings + 环境变量

`.mvn/settings.xml` 里是 `${env.GITHUB_ACTOR}` / `${env.GITHUB_TOKEN}`，凭据只经环境变量注入：

```bash
cd /Users/liuyongze/Documents/AI-agent
GITHUB_ACTOR="YOUR_GITHUB_USERNAME" \
GITHUB_TOKEN="YOUR_READ_PACKAGES_TOKEN" \
mvn --settings .mvn/settings.xml -pl backend -am -DskipTests compile
```

CI 与容器构建用的是同一份 `.mvn/settings.xml`（容器侧经 BuildKit secret 注入，见 `README.md`）。

### 3.4 验证命令 + 期望输出

```bash
cd /Users/liuyongze/Documents/AI-agent
mvn --settings .mvn/settings.xml -pl backend dependency:tree -Dincludes=org.flexagent
```

期望输出（关键行）：

```text
[INFO] com.agent:backend:jar:0.1.0-beta.3
[INFO] \- org.flexagent:flexagent-langchain4j:jar:1.2.0:compile
[INFO]    \- org.flexagent:flexagent-core:jar:1.2.0:compile
[INFO] BUILD SUCCESS
```

失败症状与处置：

| 现象 | 原因 | 处置 |
| --- | --- | --- |
| `status code: 401` / `Could not transfer artifact ... flexagent` | 无凭据或 token 无效 | 检查 `~/.m2/settings.xml` 的 `<id>github</id>` 与 token |
| `status code: 403` | token 缺 `read:packages`，或 SSO 未授权 | 补权限 / 授权 SSO |
| `status code: 404` | token 有权限但看不到该包 | 确认对该 Packages 仓库有读权限 |
| 首次能构建、之后突然 401 | token 过期 | 重新签发 |

## 4. 场景 B：无 token，但本地 / 内网 m2 有缓存

前提：**所有依赖**都在本地仓库（不只是 FlexAgent）。`mvn -o` 全程不联网。

### 4.1 校验依赖已缓存

```bash
ls -1 ~/.m2/repository/org/flexagent/flexagent-langchain4j/1.2.0/
ls -1 ~/.m2/repository/org/flexagent/flexagent-core/1.2.0/
```

期望输出（本机实测）：

```text
_remote.repositories
flexagent-langchain4j-1.2.0.jar
flexagent-langchain4j-1.2.0.pom
flexagent-langchain4j-1.2.0-sources.jar.lastUpdated
```

```text
_remote.repositories
flexagent-core-1.2.0.jar
flexagent-core-1.2.0.pom
flexagent-core-1.2.0-sources.jar.lastUpdated
```

判定标准：`*.jar` 与 `*.pom` 同时存在且非 0 字节。`*.lastUpdated` 只是"某个可选附件下载失败"
的残留（这里是 sources jar），**不影响离线构建**，可以忽略，也可以删掉。

更省事的方式：`bash scripts/check-offline-build.sh`（同时检查两个 artifact，并打印建议命令）。

### 4.2 离线构建

```bash
cd /Users/liuyongze/Documents/AI-agent
mvn -o -pl backend -am -DskipTests compile
```

期望输出（本机实测尾部）：

```text
[INFO] Reactor Summary for bug-sentinel-starter 0.1.0-beta.3:
[INFO] bug-sentinel-starter ............................... SUCCESS [  0.288 s]
[INFO] ai-agent-backend ................................... SUCCESS [  0.703 s]
[INFO] BUILD SUCCESS
```

说明：`-o`（等价 `--offline`）下不需要 `.mvn/settings.xml`；即使传了 `--settings`，离线时
settings 里的 server 凭据也不参与。

完整验证（含测试，较慢；要求本地仓库里测试依赖也齐全）：

```bash
mvn -o -pl backend -am clean verify
```

本文实测过的是离线**测试编译**（更快、同样验证测试依赖齐全）：

```bash
mvn -o -pl backend -am -DskipTests test-compile
# 期望：BUILD SUCCESS（本机实测通过）
```

`clean verify` 会跑完整后端测试套件（数百项，分钟级），发布前再跑一次即可。

### 4.3 离线依赖树验证

```bash
mvn -o -pl backend dependency:tree -Dincludes=org.flexagent
```

期望输出（本机实测）：

```text
[INFO] com.agent:backend:jar:0.1.0-beta.3
[INFO] \- org.flexagent:flexagent-langchain4j:jar:1.2.0:compile
[INFO]    \- org.flexagent:flexagent-core:jar:1.2.0:compile
[INFO] BUILD SUCCESS
```

### 4.4 把缓存搬到没有 token 的机器

```bash
# 有缓存的机器
tar -czf flexagent-m2.tgz -C ~/.m2 repository/org/flexagent

# 目标机器
mkdir -p ~/.m2
tar -xzf flexagent-m2.tgz -C ~/.m2
ls -1 ~/.m2/repository/org/flexagent/flexagent-langchain4j/1.2.0/
```

解包后的目录必须是 `~/.m2/repository/org/flexagent/...`（tar 里已含 `repository/` 前缀）。
注意这是"内网分发缓存"的应急手段：缓存来源合法、版本与 `backend/pom.xml` 一致即可。

### 4.5 失败症状（本机用空仓库复现）

```bash
mvn -o -pl backend -am -DskipTests -Dmaven.repo.local=/tmp/dsh-empty-m2 compile
```

实测报错（节选）：

```text
[ERROR] Non-resolvable parent POM for com.agent:backend:0.1.0-beta.3: The following artifacts
could not be resolved: org.springframework.boot:spring-boot-starter-parent:pom:3.5.14 (absent):
Cannot access github (https://maven.pkg.github.com/lqq151510/flexagent) in offline mode and the
artifact org.springframework.boot:spring-boot-starter-parent:pom:3.5.14 has not been downloaded
from it before.
```

要点：

- 空仓库下第一个缺失的是 Spring Boot 父 POM，而不是 FlexAgent——说明 `-o` 的前提是**全部依赖**
  已缓存，不能只补 FlexAgent。
- 如果报错信息里点名的是 `org.flexagent:flexagent-langchain4j` / `flexagent-core`，说明其余依赖
  齐全、只缺 FlexAgent，按 4.1 补齐即可。
- 报 `Cannot access github ... in offline mode` 不是网络问题，是缓存缺失；`-o` 下 Maven 永不联网。
- 若从别的机器拷贝缓存后仍报 "has not been downloaded from it before"，删除对应目录下的
  `_remote.repositories` 再试（该文件只记录"这个文件从哪个仓库来的"）。

## 5. 场景 C：完全拿不到 FlexAgent

### 5.1 会受影响的能力

FlexAgent 不是可插拔的可选件，它承载了后端 Agent 主链路：

| 文件 | 用到的 FlexAgent 能力 | 拿掉后受影响的能力 |
| --- | --- | --- |
| `backend/src/main/java/com/agent/mvp/agent/service/AgentService.java` | `AgentRuntime`、`Step`/`StepStatus`/`StepType` | 会话主循环 `executeMainLoop`、流式增量输出、执行状态机 |
| `backend/src/main/java/com/agent/mvp/agent/service/FlexRuntimeFactory.java` | `AgentRuntime`、`AgentMessage`、`RuntimeTypes`、`FlexAgentChatModel` | 按用户自定义 apiKey/baseUrl 构建 runtime、历史消息注入、默认 runtime 降级 |
| `backend/src/main/java/com/agent/mvp/agent/service/ToolCallManager.java` | `AgentRuntime.sendToolResult`、`ToolResult`、`ToolCall` | 工具调用结果回传 |
| `backend/src/main/java/com/agent/mvp/config/AgentConfiguration.java` | `FlexAgentChatModel`、`RuntimeTypes`、`ToolDefinition` | 把 langchain4j `ChatLanguageModel` 包装成 FlexAgent runtime、工具 schema 注册 |
| `backend/src/test/java/.../FlexAgentIntegrationMockTest.java` 等 3 个测试 | 同上 | 相关回归测试（其中 `AgentServiceTest` 已 `@Disabled("Replaced by FlexAgent execution loop")`） |

### 5.2 验证是否真的用到（grep 定位）

```bash
cd /Users/liuyongze/Documents/AI-agent

# 1) 主代码 + 测试里所有 org.flexagent 引用点
grep -rn --include='*.java' 'org\.flexagent' backend/src | grep -v target

# 2) 引用文件数（期望 7）
grep -rl --include='*.java' -i flexagent backend/src | wc -l

# 3) 构建侧声明
grep -n 'flexagent' backend/pom.xml
```

> 不要对仓库根目录直接 `grep -rn flexagent .`：`backend/logs/*.log` 里是历史运行日志，会刷出
> 几十万字节输出。上面的命令把范围限定在 `backend/src`。

判定标准：只要 `grep -rn --include='*.java' 'org\.flexagent' backend/src` 有输出，就说明该依赖
是编译期硬依赖，删掉依赖 = 编译失败。

### 5.3 为什么当前不建议直接删依赖

1. **没有替代实现**：主循环、工具回路、历史注入全部建立在 FlexAgent 的 `AgentRuntime` /
   `FlexAgentChatModel` 上；删依赖等于重写 `AgentService` + `FlexRuntimeFactory` +
   `AgentConfiguration` + `ToolCallManager` 及它们的测试。
2. **删掉不是"降级"而是"编译失败"**：`package org.flexagent does not exist`，beta 发布链路会
   立刻红，且失败面覆盖 4 个主代码文件 + 3 个测试文件。
3. **回归基线会被作废**：现有后端验证证据（357 项测试、JaCoCo 行 ≥65%/分支 ≥60% 门禁）都跑在
   这个实现上，换实现必须重建基线。
4. **版本是绑定的**：FlexAgent 1.2.0 与 langchain4j 0.36.2 配套（见 4.3 依赖树），替换实现需要
   重新验证 provider 路由、流式响应、工具 schema 兼容性。
5. **正确顺序是先加开关再切默认**：先引入一个可切换的实现（例如 langchain4j 原生
   `ChatLanguageModel` 直连 + 自建工具回路），保留 FlexAgent 路径作为可选项，双跑通过后再改默认值。

### 5.4 想验证"没有它会怎样"的正确姿势

不要在本仓库直接改 `backend/pom.xml`。用临时副本或独立分支验证：

```bash
# 只验证失败现象（不改任何文件）
mvn -o -pl backend -am -DskipTests -Dmaven.repo.local=/tmp/dsh-empty-m2 compile
```

或复制一份工作树到 `/tmp` 再删依赖试编译，避免污染发布分支。

## 6. 脚本：`scripts/check-offline-build.sh`

```bash
bash scripts/check-offline-build.sh          # 校验缓存 + 打印离线构建建议命令
bash scripts/check-offline-build.sh --deep   # 校验通过后真正跑一次 mvn -o 编译
bash scripts/check-offline-build.sh --help
```

- 退出码：`0` 缓存齐全；`1` 缺失；`2` 用法错误。
- 可覆盖项：`MAVEN_REPO_LOCAL`（默认 `~/.m2/repository`）、`FLEXAGENT_VERSION`（默认从
  `backend/pom.xml` 读取）。
- 校验内容：`flexagent-langchain4j` 与 `flexagent-core` 的 `*.jar` / `*.pom` 是否存在、非空、
  jar 是否为合法 zip。

期望输出（本机实测，节选）：

```text
OK   org.flexagent:flexagent-langchain4j:1.2.0  jar  /Users/liuyongze/.m2/repository/org/flexagent/flexagent-langchain4j/1.2.0/flexagent-langchain4j-1.2.0.jar
OK   org.flexagent:flexagent-langchain4j:1.2.0  pom  /Users/liuyongze/.m2/repository/org/flexagent/flexagent-langchain4j/1.2.0/flexagent-langchain4j-1.2.0.pom
OK   org.flexagent:flexagent-core:1.2.0  jar  /Users/liuyongze/.m2/repository/org/flexagent/flexagent-core/1.2.0/flexagent-core-1.2.0.jar
OK   org.flexagent:flexagent-core:1.2.0  pom  /Users/liuyongze/.m2/repository/org/flexagent/flexagent-core/1.2.0/flexagent-core-1.2.0.pom

离线构建建议命令：
  cd /Users/liuyongze/Documents/AI-agent
  mvn -o -pl backend -am -DskipTests compile
```

缺失时的期望输出（退出码 1）：

```text
FAIL org.flexagent:flexagent-langchain4j:1.2.0  jar  缺失 /tmp/empty-m2/org/flexagent/flexagent-langchain4j/1.2.0/flexagent-langchain4j-1.2.0.jar
...
修复：见 docs/offline-build.md —— 场景 A（配置 token）或场景 B（导入 m2 缓存）
```

## 7. 验收记录（2026-09-08 实测）

| 命令 | 结果 |
| --- | --- |
| `bash scripts/check-offline-build.sh` | 退出码 0，打印 4 条 OK 与缓存路径 |
| `bash scripts/check-offline-build.sh --deep` | 退出码 0，缓存校验通过后 `mvn -o` 编译 BUILD SUCCESS |
| `MAVEN_REPO_LOCAL=/tmp/dsh-empty-m2 bash scripts/check-offline-build.sh` | 退出码 1，打印 4 条 FAIL 与修复指引（缺失路径用例） |
| `mvn -o -q -pl backend -am -DskipTests compile` | 退出码 0 |
| `mvn -o -pl backend -am -DskipTests compile` | `BUILD SUCCESS`（reactor 2 个模块均 SUCCESS） |
| `mvn -o -pl backend -am -DskipTests test-compile` | `BUILD SUCCESS`（测试依赖离线齐全） |
| `mvn -o -pl backend dependency:tree -Dincludes=org.flexagent` | `flexagent-langchain4j:1.2.0` → `flexagent-core:1.2.0`，`BUILD SUCCESS` |
| `mvn -o -pl backend -am -DskipTests -Dmaven.repo.local=/tmp/dsh-empty-m2 compile` | 预期失败，报 `Cannot access github ... in offline mode` |

## 8. 遗留风险

- **缓存不是发布物**：本机可用靠的是 `~/.m2` 里已有的 jar；换机器、清缓存、升级版本（例如
  `flexagent.version` 改成 1.5.0）都会重新落到场景 A/C。升级版本前先确认新版本已被缓存或可下载。
- **只有 1.2.0 是"已缓存验证"的版本**：本机 m2 里还有 1.3.0/1.4.0/1.5.0 等目录，但本仓库
  构建只验证过 1.2.0。
- **内网缓存分发无校验**：4.4 的 tar 方案没有 checksum 校验，属于应急手段；长期方案是内网
  Nexus/Artifactory 代理 GitHub Packages。
- **CI 依赖 token 可用性**：GitHub Actions 用 `GITHUB_TOKEN`/PAT 拉包，token 过期或 SSO 变更会
  让发布流水线红，排查时先看是不是 401/403。
