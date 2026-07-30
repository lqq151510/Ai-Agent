package com.agent.mvp.config;

import com.agent.mvp.agent.ModelProviderType;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private ModelProviderType defaultProvider = ModelProviderType.OPENAI;
    private String defaultOpenaiModel = "qwen/qwen3.5-9b";
    private String workspaceRoot = ".";
    private final Openai openai = new Openai();
    private final Cors cors = new Cors();
    private final ModelRuntime modelRuntime = new ModelRuntime();
    private final Agent agent = new Agent();
    private final RateLimit rateLimit = new RateLimit();
    private final StartupValidation startupValidation = new StartupValidation();
    private final PythonService pythonService = new PythonService();
    private final VertexAi vertexAi = new VertexAi();
    private final PgVector pgVector = new PgVector();

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

    public String getWorkspaceRoot() {
        return workspaceRoot;
    }

    public void setWorkspaceRoot(String workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }

    public Openai getOpenai() {
        return openai;
    }

    public Cors getCors() {
        return cors;
    }

    public ModelRuntime getModelRuntime() {
        return modelRuntime;
    }

    public Agent getAgent() {
        return agent;
    }

    public RateLimit getRateLimit() {
        return rateLimit;
    }

    public StartupValidation getStartupValidation() {
        return startupValidation;
    }

    public PythonService getPythonService() {
        return pythonService;
    }

    public VertexAi getVertexAi() {
        return vertexAi;
    }

    public PgVector getPgVector() {
        return pgVector;
    }

    public String getDefaultModel(ModelProviderType provider) {
        if (provider == null) {
            return defaultOpenaiModel;
        }
        return switch (provider) {
            case OPENAI -> defaultOpenaiModel;
            case VERTEXAI -> "gemini-2.5-pro";
        };
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

    public static class Cors {
        private List<String> allowedOrigins =
                new ArrayList<>(List.of("http://localhost:5173", "http://127.0.0.1:5173"));

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

    public static class Agent {
        private int maxContextTokens = 6_000;
        private int maxToolSteps = 4;
        private boolean stopOnToolError = true;
        private long streamTimeoutMs = 300_000;
        private long heartbeatIntervalMs = 10_000;
        private int streamExecutorCorePoolSize = 4;
        private int streamExecutorMaxPoolSize = 16;
        private int streamExecutorQueueCapacity = 64;
        private int heartbeatThreads = 2;

        public int getMaxContextTokens() {
            return maxContextTokens;
        }

        public void setMaxContextTokens(int maxContextTokens) {
            this.maxContextTokens = maxContextTokens;
        }

        public int getMaxToolSteps() {
            return maxToolSteps;
        }

        public void setMaxToolSteps(int maxToolSteps) {
            this.maxToolSteps = maxToolSteps;
        }

        public boolean isStopOnToolError() {
            return stopOnToolError;
        }

        public void setStopOnToolError(boolean stopOnToolError) {
            this.stopOnToolError = stopOnToolError;
        }

        public long getStreamTimeoutMs() {
            return streamTimeoutMs;
        }

        public void setStreamTimeoutMs(long streamTimeoutMs) {
            this.streamTimeoutMs = streamTimeoutMs;
        }

        public long getHeartbeatIntervalMs() {
            return heartbeatIntervalMs;
        }

        public void setHeartbeatIntervalMs(long heartbeatIntervalMs) {
            this.heartbeatIntervalMs = heartbeatIntervalMs;
        }

        public int getStreamExecutorCorePoolSize() {
            return streamExecutorCorePoolSize;
        }

        public void setStreamExecutorCorePoolSize(int streamExecutorCorePoolSize) {
            this.streamExecutorCorePoolSize = streamExecutorCorePoolSize;
        }

        public int getStreamExecutorMaxPoolSize() {
            return streamExecutorMaxPoolSize;
        }

        public void setStreamExecutorMaxPoolSize(int streamExecutorMaxPoolSize) {
            this.streamExecutorMaxPoolSize = streamExecutorMaxPoolSize;
        }

        public int getStreamExecutorQueueCapacity() {
            return streamExecutorQueueCapacity;
        }

        public void setStreamExecutorQueueCapacity(int streamExecutorQueueCapacity) {
            this.streamExecutorQueueCapacity = streamExecutorQueueCapacity;
        }

        public int getHeartbeatThreads() {
            return heartbeatThreads;
        }

        public void setHeartbeatThreads(int heartbeatThreads) {
            this.heartbeatThreads = heartbeatThreads;
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

    /** python-service 文档解析服务配置。 */
    public static class PythonService {
        /** 基础地址，例如 http://localhost:8000 */
        private String baseUrl = "http://localhost:8000";

        /** 连接超时（毫秒） */
        private long connectTimeoutMs = 3_000;

        /** 读取超时（毫秒），文档解析可能较慢 */
        private long readTimeoutMs = 30_000;

        /** 是否启用（不可用时降级到本地逻辑） */
        private boolean enabled = true;

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

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

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }
    }

    /** Vertex AI 配置。 */
    public static class VertexAi {
        private String projectId = "";
        private String location = "us-central1";
        private String modelName = "gemini-2.5-pro";

        public String getProjectId() {
            return projectId;
        }

        public void setProjectId(String projectId) {
            this.projectId = projectId;
        }

        public String getLocation() {
            return location;
        }

        public void setLocation(String location) {
            this.location = location;
        }

        public String getModelName() {
            return modelName;
        }

        public void setModelName(String modelName) {
            this.modelName = modelName;
        }
    }

    /** PgVector 连接配置。 */
    public static class PgVector {
        private String host = "localhost";
        private int port = 5432;
        private String database = "ai_agent";
        private String username = "postgres";
        private String password = "change-me";

        public String getHost() {
            return host;
        }

        public void setHost(String host) {
            this.host = host;
        }

        public int getPort() {
            return port;
        }

        public void setPort(int port) {
            this.port = port;
        }

        public String getDatabase() {
            return database;
        }

        public void setDatabase(String database) {
            this.database = database;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }
    }
}
