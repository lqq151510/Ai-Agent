# Legacy 归档模块（`agent-*` 微服务）

**状态：已归档（Archived）。** 这些模块不在 Knowledge Desk 产品主线内，不参与根 reactor 构建、不参与 CI 门禁、不随发布产物交付。

## 1. 为什么归档

- 它们依赖尚未部署的 Kafka / Milvus 基础设施，默认环境跑不起来。
- 它们不是 Desktop / CLI 的运行时依赖：`backend`、`desktop`、`ts-cli`、`local-service` 均不依赖 `com.agent:agent-*`。
- 根 `pom.xml` 曾用 `-Plegacy` profile 保留它们，容易让读者误以为它们仍在产品主线里（且模块版本停在 `0.1.0-beta.2`，与发布线不一致）。

## 2. 本次归档动作

| 项 | 变更 |
| --- | --- |
| 目录 | 6 个模块从仓库根目录移动到 `legacy/`，用 `git mv` 保留历史 |
| 根 `pom.xml` | 删除 `<profiles>` 中的 `legacy` profile，根 reactor 只保留 `backend`、`bug-sentinel-starter` |
| 聚合器 | 新增 `legacy/pom.xml`（独立聚合器 + parent 链到 `spring-boot-starter-parent`），不再依赖根 `pom.xml` |
| `agent-common` | parent 由 `com.agent:ai-agent-mvp` 改为 `com.agent:ai-agent-legacy`（`relativePath=../pom.xml`） |
| 内部依赖 | 5 个服务对 `agent-common` 的版本改为 `${project.version}`，避免再次出现版本漂移 |
| 版本 | 整棵 legacy 树统一为 `0.1.0-beta.3`（见第 5 节） |
| 清理 | 删除各模块 `.github/modernize/java-upgrade/*/deps.txt`（IDE 升级工具生成的依赖清单，含 ANSI 控制符） |

## 3. 如何构建

```bash
# 只编译打包，不跑测试
mvn -f legacy/pom.xml -DskipTests package

# 需要 JDK 21
```

构建阶段不需要 Kafka / Milvus，只有**运行**这些服务时才需要。

## 4. 模块地图

| 模块 | 作用 | 关键依赖 |
| --- | --- | --- |
| `agent-common` | 共享事件模型与 Kafka topic 常量 | Jackson、SLF4J、Lombok |
| `agent-gateway` | WebFlux SSE 网关 | Spring WebFlux、Spring Kafka |
| `agent-router` | 任务输入与计划审批的 Kafka 消费者 | Spring Kafka、LangChain4j |
| `agent-retrieval` | 检索服务 | LangChain4j + Milvus、MyBatis-Plus、PostgreSQL |
| `agent-generation` | 生成任务消费者 | Spring Kafka、LangChain4j |
| `agent-reflection` | 反思任务消费者 | Spring Kafka、LangChain4j |

## 5. 版本策略

`legacy/pom.xml` 的 `<version>` 跟随仓库发布版本（当前 `0.1.0-beta.3`），目的只是让 `git grep` / 版本巡检不会读到孤儿版本号。这些模块**不随发布发布**，也不在 `scripts/check-release-version.sh` 的检查清单里；发布版本再次上调时，这里可以一起改，也可以保持冻结，都不影响发布门禁。

## 6. 复活规则（do not revive silently）

1. 不要把这 6 个模块加回根 `pom.xml` 的 `<modules>` 或重建 `legacy` profile。
2. 不要让 `backend` / `desktop` / `ts-cli` / `local-service` 依赖 `com.agent:agent-*`。
3. 需要复活时，先在 `docs/arch/` 写一条设计决策记录（为什么复活、Kafka / Milvus 从哪来、如何进 CI 与发布门禁），再改代码。

## 7. 注意：两套 “legacy” 不是一回事

- **本目录**：被归档的 Maven 模块。
- **Spring profile `legacy`**（`SPRING_PROFILES_ACTIVE=legacy`、`@Profile("legacy")`、`AI_AGENT_ENABLE_LEGACY_DEVTOOLS`）：`backend` 中默认关闭的开发者工具（tool-stats / release-report / CodeToolService 等），与本目录无关，**不要一起改**。
