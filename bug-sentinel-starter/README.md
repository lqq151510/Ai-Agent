# bug-sentinel-starter

一个轻量级的 Spring Boot Starter，用于将应用未捕获的异常堆栈自动异步上报到指定 Webhook，便于接入告警平台（飞书/钉钉/企业微信/自建 Sentinel 接收端）。

## 自动配置触发条件

本 starter 通过 Spring Boot 3 的 `AutoConfiguration.imports` 机制注册 [`BugSentinelAutoConfiguration`](src/main/java/com/agent/sentinel/BugSentinelAutoConfiguration.java)，触发条件：

1. **classpath 中存在本 starter**：项目 `pom.xml` 依赖了 `com.agent:bug-sentinel-starter`。
2. **配置开关未关闭**：`bug.sentinel.enabled` 未显式设为 `false`（默认开启，`matchIfMissing = true`）。
3. **无自定义 Bean 覆盖**：当容器中不存在 `SentinelWebhookClient` / `GlobalSentinelExceptionHandler` 时才注册默认实现（可通过 `@ConditionalOnMissingBean` 覆盖）。

满足上述条件后，会自动注册：

- `SentinelWebhookClient`：异步上报异常堆栈到 webhook URL
- `GlobalSentinelExceptionHandler`：全局 `@ControllerAdvice`，兜底捕获所有 `Exception` 并上报，然后 re-throw 交由 Spring 默认错误处理

## 配置项

所有配置项均支持环境变量覆盖，默认值已给出。

| 配置项 | 环境变量 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `bug.sentinel.enabled` | `BUG_SENTINEL_ENABLED` | `true` | 总开关，设为 `false` 完全禁用自动配置 |
| `bug.sentinel.webhook.url` | `BUG_SENTINEL_WEBHOOK_URL` | `http://localhost:8080/api/v1/sentinel/report` | 异常上报的 webhook 接收地址 |
| `bug.sentinel.environment` | `BUG_SENTINEL_ENV` | `${spring.profiles.active:default}` | 环境标签，用于在告警平台区分 dev/staging/prod |
| `spring.application.name` | - | `default-project` | 项目名，作为上报 payload 的 `projectName` 字段 |

### application.yml 示例

```yaml
bug:
  sentinel:
    enabled: true
    environment: prod
    webhook:
      url: https://hooks.feishu.example.com/sentinel
```

## 接入示例

### 最少 3 行代码接入（全局兜底）

只需在 `pom.xml` 添加依赖，无需写任何代码，所有未捕获异常即自动上报：

```xml
<dependency>
    <groupId>com.agent</groupId>
    <artifactId>bug-sentinel-starter</artifactId>
    <version>0.1.0-SNAPSHOT</version>
</dependency>
```

```yaml
# application.yml
bug:
  sentinel:
    enabled: true
    webhook:
      url: https://your-webhook.example.com/report
```

### 方法级标记接入（@SentinelWebhook）

对于需要重点监控的 Controller 方法，可添加 `@SentinelWebhook` 注解做文档化标记（当前由 `GlobalSentinelExceptionHandler` 全局兜底上报，注解用于未来扩展方法级精准上报与业务标签）：

```java
import com.agent.sentinel.SentinelWebhook;

@PostMapping("/execute-multi-agent")
@SentinelWebhook(tag = "coach.multi-agent")
public ResponseEntity<String> executeMultiAgent(@RequestBody String requirement, Authentication auth) {
    // 业务逻辑
}
```

## 与 GlobalSentinelExceptionHandler 的关系

`GlobalSentinelExceptionHandler` 是本 starter 提供的全局异常处理器（`@ControllerAdvice`），工作流程：

1. 任意 Controller 方法抛出 `Exception`（未被业务 `@ExceptionHandler` 捕获的）
2. `GlobalSentinelExceptionHandler#handleException` 被触发
3. 将异常堆栈转为字符串，调用 `SentinelWebhookClient#reportException` **异步**上报（不阻塞主流程）
4. **re-throw 原异常**，交由 Spring Boot 默认的 `BasicErrorController` / 项目自身的 `@RestControllerAdvice`（如 `ApiExceptionHandler`）继续处理响应

关键设计点：

- **异步上报**：使用 `CompletableFuture.runAsync`，上报失败静默吞掉，绝不影响主业务或造成循环
- **不抢占响应**：re-throw 保证项目原有的 `ApiExceptionHandler`（返回 `ErrorResponse` JSON）仍正常工作，Sentinel 只负责"旁路告警"
- **可覆盖**：若项目需要自定义上报逻辑，只需自定义注册一个 `SentinelWebhookClient` 或 `GlobalSentinelExceptionHandler` Bean，本 starter 的默认实现会因 `@ConditionalOnMissingBean` 自动退让

## 上报 Payload 格式

POST 到 webhook URL 的 JSON body：

```json
{
  "projectName": "ai-agent-backend",
  "environment": "prod",
  "stackTrace": "java.lang.NullPointerException\n\tat com.agent.mvp.coach.CoachController.executeMultiAgent(...)",
  "tag": "coach.multi-agent"
}
```

`tag` 字段可选，仅当方法标注了 `@SentinelWebhook(tag = "...")` 且未来接入 AOP 切面时才会填充。
