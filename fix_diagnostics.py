import re

with open("backend/src/main/java/com/agent/mvp/system/service/SystemDiagnosticsService.java", "r") as f:
    content = f.read()

# Add field and constructor injection for WebClient.Builder
content = re.sub(
    r'private final AppProperties appProperties;\n\n    public SystemDiagnosticsService\(JdbcTemplate jdbcTemplate,\n                                    @Autowired\(required = false\) RedisTemplate<String, Object> redisTemplate,\n                                    AppProperties appProperties\) \{',
    """private final AppProperties appProperties;
    private final WebClient webClient;

    public SystemDiagnosticsService(JdbcTemplate jdbcTemplate,
                                    @Autowired(required = false) RedisTemplate<String, Object> redisTemplate,
                                    AppProperties appProperties,
                                    WebClient.Builder webClientBuilder) {""",
    content
)

# Initialize webclient
content = re.sub(
    r'this\.appProperties = appProperties;\n    \}',
    """this.appProperties = appProperties;
        int connectTimeoutMs = (int) Math.max(500, appProperties.getModelRuntime().getConnectTimeoutMs());
        HttpClient httpClient = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, connectTimeoutMs)
                .responseTimeout(Duration.ofMillis(Math.max(500, appProperties.getStartupValidation().getModelProbeTimeoutMs())));
        this.webClient = webClientBuilder
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }""",
    content
)

# remove getWebClient method and volatile webClient
content = re.sub(r'private volatile WebClient webClient;[\s\S]*?private WebClient getWebClient\(\) \{[\s\S]*?return webClient;\n    \}', '', content)

# update getWebClient() usages to webClient
content = content.replace("getWebClient().", "webClient.")

with open("backend/src/main/java/com/agent/mvp/system/service/SystemDiagnosticsService.java", "w") as f:
    f.write(content)
print("SystemDiagnosticsService Fixed")
