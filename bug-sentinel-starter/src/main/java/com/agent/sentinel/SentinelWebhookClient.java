package com.agent.sentinel;

import jakarta.annotation.PreDestroy;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

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
    private final String token;
    private final boolean enabled;

    private final ExecutorService executor = new ThreadPoolExecutor(
            2, 2, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(32),
            r -> {
                Thread t = new Thread(r, "sentinel-webhook");
                t.setDaemon(true);
                return t;
            }, new ThreadPoolExecutor.AbortPolicy()
    );

    public SentinelWebhookClient(String webhookUrl, String projectName) {
        this(webhookUrl, projectName, "default", "", false);
    }

    public SentinelWebhookClient(
            String webhookUrl, String projectName, String environment, boolean enabled) {
        this(webhookUrl, projectName, environment, "", enabled);
    }

    public SentinelWebhookClient(
            String webhookUrl, String projectName, String environment, String token, boolean enabled) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(10000);
        this.restTemplate = new RestTemplate(factory);
        this.webhookUrl =
                webhookUrl != null
                        ? webhookUrl
                        : "http://localhost:8080/api/v1/sentinel/report";
        this.projectName = projectName != null ? projectName : "default-project";
        this.environment = environment != null ? environment : "default";
        this.token = token != null ? token : "";
        this.enabled = enabled && !this.token.isBlank() && !this.webhookUrl.isBlank();
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
        try {
            executor.execute(() -> sendReport(stackTrace, tag));
        } catch (RejectedExecutionException ignored) {
            // A full queue drops diagnostics without affecting the request path.
        }
    }

    private void sendReport(String stackTrace, String tag) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Sentinel " + token);
            Map<String, String> payload = new HashMap<>();
            payload.put("projectName", projectName);
            payload.put("environment", environment);
            payload.put("stackTrace", SentinelRedactor.redact(stackTrace, 4000));
            if (tag != null && !tag.isBlank()) payload.put("tag", tag);
            restTemplate.postForEntity(webhookUrl, new HttpEntity<>(payload, headers), String.class);
        } catch (Exception ignored) {
            // 上报失败静默忽略，避免影响主业务或形成递归
        }
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
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
