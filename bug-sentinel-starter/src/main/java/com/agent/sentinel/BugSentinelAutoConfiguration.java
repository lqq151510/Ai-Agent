package com.agent.sentinel;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BugSentinelAutoConfiguration {

    @Value("${bug.sentinel.webhook.url:http://localhost:8080/api/v1/sentinel/report}")
    private String webhookUrl;

    @Value("${spring.application.name:default-project}")
    private String projectName;

    @Bean
    @ConditionalOnMissingBean
    public SentinelWebhookClient sentinelWebhookClient() {
        return new SentinelWebhookClient(webhookUrl, projectName);
    }

    @Bean
    @ConditionalOnMissingBean
    public GlobalSentinelExceptionHandler globalSentinelExceptionHandler(SentinelWebhookClient webhookClient) {
        return new GlobalSentinelExceptionHandler(webhookClient);
    }
}
