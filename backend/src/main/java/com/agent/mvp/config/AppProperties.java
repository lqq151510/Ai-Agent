package com.agent.mvp.config;

import com.agent.mvp.agent.ModelProviderType;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private ModelProviderType defaultProvider = ModelProviderType.OLLAMA;
    private String defaultOpenaiModel = "qwen/qwen3.5-9b";
    private String defaultOllamaModel = "qwen3.6:latest";
    private String workspaceRoot = ".";
    private final Openai openai = new Openai();
    private final Ollama ollama = new Ollama();
    private final Cors cors = new Cors();
    private final ModelRuntime modelRuntime = new ModelRuntime();
    private final RateLimit rateLimit = new RateLimit();
    private final StartupValidation startupValidation = new StartupValidation();

    public ModelProviderType getDefaultProvider() {
        return defaultProvider;
    }

    public void setDefaultProvider(ModelProviderType defaultProvider) {
        this.defaultProvider = defaultProvider;
    }

    public String getDefaultOpenaiModel() {
        return defaultOpenaiModel;
    }

    public void setDefaultOpenaiModel(String defaultOpenaiModel) {
        this.defaultOpenaiModel = defaultOpenaiModel;
    }

    public String getDefaultOllamaModel() {
        return defaultOllamaModel;
    }

    public void setDefaultOllamaModel(String defaultOllamaModel) {
        this.defaultOllamaModel = defaultOllamaModel;
    }

    public String getWorkspaceRoot() {
        return workspaceRoot;
    }

    public void setWorkspaceRoot(String workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }

    public Openai getOpenai() {
        return openai;
    }

    public Ollama getOllama() {
        return ollama;
    }

    public Cors getCors() {
        return cors;
    }

    public ModelRuntime getModelRuntime() {
        return modelRuntime;
    }

    public RateLimit getRateLimit() {
        return rateLimit;
    }

    public StartupValidation getStartupValidation() {
        return startupValidation;
    }

    public static class Openai {
        private String baseUrl = "https://api.openai.com/v1";
        private String apiKey;

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }
    }

    public static class Ollama {
        private String baseUrl = "http://127.0.0.1:11434";

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }
    }

    public static class Cors {
        private List<String> allowedOrigins = new ArrayList<>(List.of(
                "http://localhost:5173",
                "http://127.0.0.1:5173"
        ));

        public List<String> getAllowedOrigins() {
            return allowedOrigins;
        }

        public void setAllowedOrigins(List<String> allowedOrigins) {
            this.allowedOrigins = allowedOrigins;
        }
    }

    public static class ModelRuntime {
        private long connectTimeoutMs = 5_000;
        private long readTimeoutMs = 45_000;
        private long totalTimeoutMs = 300_000;
        private int idempotentRetries = 1;

        public long getConnectTimeoutMs() {
            return connectTimeoutMs;
        }

        public void setConnectTimeoutMs(long connectTimeoutMs) {
            this.connectTimeoutMs = connectTimeoutMs;
        }

        public long getReadTimeoutMs() {
            return readTimeoutMs;
        }

        public void setReadTimeoutMs(long readTimeoutMs) {
            this.readTimeoutMs = readTimeoutMs;
        }

        public long getTotalTimeoutMs() {
            return totalTimeoutMs;
        }

        public void setTotalTimeoutMs(long totalTimeoutMs) {
            this.totalTimeoutMs = totalTimeoutMs;
        }

        public int getIdempotentRetries() {
            return idempotentRetries;
        }

        public void setIdempotentRetries(int idempotentRetries) {
            this.idempotentRetries = idempotentRetries;
        }
    }

    public static class RateLimit {
        private long loginPerMinute = 20;
        private long registerPerMinute = 10;
        private long refreshPerMinute = 60;
        private long chatPerMinute = 60;
        private long chatPremiumPerMinute = 120;
        private List<String> premiumEmailSuffixes = new ArrayList<>();

        public long getLoginPerMinute() {
            return loginPerMinute;
        }

        public void setLoginPerMinute(long loginPerMinute) {
            this.loginPerMinute = loginPerMinute;
        }

        public long getChatPerMinute() {
            return chatPerMinute;
        }

        public void setChatPerMinute(long chatPerMinute) {
            this.chatPerMinute = chatPerMinute;
        }

        public long getChatPremiumPerMinute() {
            return chatPremiumPerMinute;
        }

        public void setChatPremiumPerMinute(long chatPremiumPerMinute) {
            this.chatPremiumPerMinute = chatPremiumPerMinute;
        }

        public long getRegisterPerMinute() {
            return registerPerMinute;
        }

        public void setRegisterPerMinute(long registerPerMinute) {
            this.registerPerMinute = registerPerMinute;
        }

        public long getRefreshPerMinute() {
            return refreshPerMinute;
        }

        public void setRefreshPerMinute(long refreshPerMinute) {
            this.refreshPerMinute = refreshPerMinute;
        }

        public List<String> getPremiumEmailSuffixes() {
            return premiumEmailSuffixes;
        }

        public void setPremiumEmailSuffixes(List<String> premiumEmailSuffixes) {
            this.premiumEmailSuffixes = premiumEmailSuffixes;
        }
    }

    public static class StartupValidation {
        private boolean failFast = true;
        private long modelProbeTimeoutMs = 3_000;
        private int modelProbeRetries = 1;

        public boolean isFailFast() {
            return failFast;
        }

        public void setFailFast(boolean failFast) {
            this.failFast = failFast;
        }

        public long getModelProbeTimeoutMs() {
            return modelProbeTimeoutMs;
        }

        public void setModelProbeTimeoutMs(long modelProbeTimeoutMs) {
            this.modelProbeTimeoutMs = modelProbeTimeoutMs;
        }

        public int getModelProbeRetries() {
            return modelProbeRetries;
        }

        public void setModelProbeRetries(int modelProbeRetries) {
            this.modelProbeRetries = modelProbeRetries;
        }
    }
}
