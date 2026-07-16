package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.ParsedDocument;
import com.agent.mvp.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

/**
 * python-service 文档解析客户端。
 *
 * <p>通过 WebClient 调用 python-service 的 {@code /parse} 接口，将文档转换为 Markdown。 当 python-service
 * 不可用或调用失败时，调用方应降级到本地 MarkItDownService。
 *
 * <p>本类只负责"调用远端"，不做降级决策；降级逻辑由 {@link MarkItDownService} 统一编排。
 */
@Service
public class PythonParseClient {

    private static final Logger log = LoggerFactory.getLogger(PythonParseClient.class);

    private final WebClient webClient;
    private final AppProperties appProperties;

    public PythonParseClient(
            @Qualifier("pythonServiceWebClient") WebClient webClient, AppProperties appProperties) {
        this.webClient = webClient;
        this.appProperties = appProperties;
    }

    /**
     * 调用 python-service 解析文档。
     *
     * @param content 文件二进制内容
     * @param filename 文件名（用于推断格式与远端校验）
     * @return 解析结果
     * @throws PythonServiceUnavailableException 当 python-service 不可用或返回非 2xx 时抛出
     */
    public ParsedDocument parse(byte[] content, String filename) {
        if (!appProperties.getPythonService().isEnabled()) {
            throw new PythonServiceUnavailableException("python-service 已被配置禁用");
        }

        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                "file",
                new ByteArrayResource(content) {
                    @Override
                    public String getFilename() {
                        return filename != null ? filename : "unknown";
                    }
                });

        try {
            return webClient
                    .post()
                    .uri("/parse")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(BodyInserters.fromMultipartData(builder.build()))
                    .retrieve()
                    .bodyToMono(ParsedDocument.class)
                    .onErrorMap(
                            WebClientResponseException.class,
                            e ->
                                    new PythonServiceUnavailableException(
                                            "python-service 返回状态: " + e.getStatusCode().value(), e))
                    .onErrorMap(
                            e -> !(e instanceof PythonServiceUnavailableException),
                            e ->
                                    new PythonServiceUnavailableException(
                                            "调用 python-service 失败: " + e.getMessage(), e))
                    .block();
        } catch (Exception e) {
            if (e instanceof PythonServiceUnavailableException) {
                throw (PythonServiceUnavailableException) e;
            }
            throw new PythonServiceUnavailableException("调用 python-service 异常", e);
        }
    }

    /**
     * 探活：调用 {@code /health} 端点。
     *
     * @return true 表示服务可用
     */
    public boolean isAvailable() {
        if (!appProperties.getPythonService().isEnabled()) {
            return false;
        }
        try {
            String body =
                    webClient
                            .get()
                            .uri("/health")
                            .retrieve()
                            .bodyToMono(String.class)
                            .onErrorResume(e -> Mono.empty())
                            .block();
            return body != null && body.contains("\"status\":\"ok\"");
        } catch (Exception e) {
            log.debug("python-service 探活失败: {}", e.getMessage());
            return false;
        }
    }

    /** python-service 不可用异常，用于触发降级。 */
    public static class PythonServiceUnavailableException extends RuntimeException {
        public PythonServiceUnavailableException(String message) {
            super(message);
        }

        public PythonServiceUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
