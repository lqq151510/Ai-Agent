package com.agent.sentinel;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Sentinel Webhook 客户端，负责将异常堆栈异步上报到指定 webhook URL。
 *
 * <p>上报失败会被静默吞掉，避免影响主业务流程或造成无限循环。
 */
public class SentinelWebhookClient {

    private final RestTemplate restTemplate;
    private final String webhookUrl;
    private final String projectName;
    private final String environment;
    private final boolean enabled;

    public SentinelWebhookClient(String webhookUrl, String projectName) {
        this(webhookUrl, projectName, "default", true);
    }

    public SentinelWebhookClient(
            String webhookUrl, String projectName, String environment, boolean enabled) {
        this.restTemplate = new RestTemplate();
        this.webhookUrl =
                webhookUrl != null
                        ? webhookUrl
                        : "http://localhost:8080/api/v1/sentinel/report";
        this.projectName = projectName != null ? projectName : "default-project";
        this.environment = environment != null ? environment : "default";
        this.enabled = enabled;
    }

    /**
     * 异步上报异常堆栈。当 {@code enabled=false} 时直接跳过。
     *
     * @param stackTrace 异常堆栈字符串
     */
    public void reportException(String stackTrace) {
        if (!enabled) {
            return;
        }
        final String tag = currentTag.get();
        CompletableFuture.runAsync(
                () -> {
                    try {
                        HttpHeaders headers = new HttpHeaders();
                        headers.setContentType(MediaType.APPLICATION_JSON);

                        Map<String, String> payload = new HashMap<>();
                        payload.put("projectName", projectName);
                        payload.put("environment", environment);
                        payload.put("stackTrace", stackTrace);
                        if (tag != null && !tag.isBlank()) {
                            payload.put("tag", tag);
                        }

                        HttpEntity<Map<String, String>> request = new HttpEntity<>(payload, headers);
                        restTemplate.postForEntity(webhookUrl, request, String.class);
                    } catch (Exception e) {
                        // 上报失败静默忽略，避免无限循环
                        System.err.println("Failed to send sentinel report: " + e.getMessage());
                    }
                });
    }

    /** 当前线程绑定的业务标签（由 AOP 切面设置），用于区分上报来源。 */
    private static final ThreadLocal<String> currentTag = new ThreadLocal<>();

    /** 供 AOP 切面设置当前方法的业务标签。 */
    public static void setTag(String tag) {
        currentTag.set(tag);
    }

    /** 供 AOP 切面清理当前方法的业务标签。 */
    public static void clearTag() {
        currentTag.remove();
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String getProjectName() {
        return projectName;
    }

    public String getEnvironment() {
        return environment;
    }
}
