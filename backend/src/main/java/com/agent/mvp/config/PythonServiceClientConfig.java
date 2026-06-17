package com.agent.mvp.config;

import io.netty.channel.ChannelOption;
import io.netty.handler.timeout.ReadTimeoutHandler;
import io.netty.handler.timeout.WriteTimeoutHandler;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;
import reactor.netty.resources.ConnectionProvider;

/**
 * python-service 专用的 WebClient 配置。
 *
 * <p>复用 Reactor Netty 的连接池（ConnectionProvider），并设置较大的内存缓冲区以支持
 * 文档上传/下载。超时参数由 {@link AppProperties.PythonService} 提供。
 */
@Configuration
public class PythonServiceClientConfig {

    /** 内存缓冲区上限：32MB，避免大文档解析时超出默认 256KB 限制。 */
    private static final int MAX_IN_MEMORY_SIZE = 32 * 1024 * 1024;

    /**
     * python-service 专用 WebClient Bean。
     *
     * <p>命名 bean 以避免与项目中可能存在的其他 WebClient 冲突。
     */
    @Bean(name = "pythonServiceWebClient")
    public WebClient pythonServiceWebClient(AppProperties appProperties) {
        AppProperties.PythonService cfg = appProperties.getPythonService();

        // 连接池配置：复用连接，最多 50 个连接，每个 host 最多 20 个
        ConnectionProvider provider =
                ConnectionProvider.builder("python-service-pool")
                        .maxConnections(50)
                        .maxIdleTime(java.time.Duration.ofSeconds(30))
                        .maxLifeTime(java.time.Duration.ofMinutes(5))
                        .pendingAcquireMaxCount(100)
                        .pendingAcquireTimeout(java.time.Duration.ofSeconds(10))
                        .build();

        HttpClient httpClient =
                HttpClient.create(provider)
                        .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, (int) cfg.getConnectTimeoutMs())
                        .option(ChannelOption.SO_KEEPALIVE, true)
                        .responseTimeout(java.time.Duration.ofMillis(cfg.getReadTimeoutMs()))
                        .doOnConnected(
                                conn ->
                                        conn.addHandlerLast(
                                                        new ReadTimeoutHandler(
                                                                cfg.getReadTimeoutMs(),
                                                                TimeUnit.MILLISECONDS))
                                                .addHandlerLast(
                                                        new WriteTimeoutHandler(
                                                                cfg.getReadTimeoutMs(),
                                                                TimeUnit.MILLISECONDS)));

        return WebClient.builder()
                .baseUrl(cfg.getBaseUrl())
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(
                        configurer ->
                                configurer.defaultCodecs().maxInMemorySize(MAX_IN_MEMORY_SIZE))
                .build();
    }
}
