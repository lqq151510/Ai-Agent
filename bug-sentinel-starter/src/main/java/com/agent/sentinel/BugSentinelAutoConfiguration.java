package com.agent.sentinel;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;

/**
 * Bug Sentinel 自动配置。
 *
 * <p>触发条件：
 * <ul>
 *   <li>classpath 中存在本 starter（即项目依赖 {@code bug-sentinel-starter}）</li>
 *   <li>配置 {@code bug.sentinel.enabled=true}</li>
 * </ul>
 *
 * <p>自动注册以下组件：
 * <ul>
 *   <li>{@link SentinelWebhookClient}：异步上报异常堆栈到 webhook</li>
 *   <li>{@link GlobalSentinelExceptionHandler}：全局 {@code @ControllerAdvice} 兜底上报</li>
 * </ul>
 */
@AutoConfiguration
@ConditionalOnProperty(prefix = "bug.sentinel", name = "enabled", havingValue = "true")
public class BugSentinelAutoConfiguration {

    @Value("${bug.sentinel.webhook.url:}")
    private String webhookUrl;

    @Value("${spring.application.name:default-project}")
    private String projectName;

    /** 环境标签，用于在告警平台区分 dev/staging/prod。 */
    @Value("${bug.sentinel.environment:${spring.profiles.active:default}}")
    private String environment;

    @Value("${BUG_SENTINEL_TOKEN:}")
    private String token;

    @Bean
    @ConditionalOnMissingBean
    public SentinelWebhookClient sentinelWebhookClient() {
        if (token.isBlank() || webhookUrl.isBlank()) {
            throw new IllegalStateException("BUG_SENTINEL_TOKEN and bug.sentinel.webhook.url are required when Sentinel is enabled");
        }
        return new SentinelWebhookClient(webhookUrl, projectName, environment, token, true);
    }

    @Bean
    @ConditionalOnMissingBean
    public GlobalSentinelExceptionHandler globalSentinelExceptionHandler(
            SentinelWebhookClient webhookClient) {
        return new GlobalSentinelExceptionHandler(webhookClient);
    }
}
