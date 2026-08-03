package com.agent.mvp.coach.service;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.CodeRAGService;
import com.agent.mvp.agent.service.ModelGateway;
import com.agent.mvp.agent.service.RAGMemoryService;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.auth.service.UserService;
import com.agent.mvp.coach.agent.SupervisorAgent;
import com.agent.mvp.coach.domain.GeneratedScaffold;
import com.agent.mvp.coach.domain.ScaffoldFile;
import com.agent.mvp.coach.dto.ApiEndpointPlan;
import com.agent.mvp.coach.dto.CoachItem;
import com.agent.mvp.coach.dto.CoachRunResponse;
import com.agent.mvp.coach.dto.LogDiagnosis;
import com.agent.mvp.coach.dto.LogDiagnosisRequest;
import com.agent.mvp.coach.dto.LogDiagnosisResponse;
import com.agent.mvp.coach.dto.RequirementBreakdown;
import com.agent.mvp.coach.dto.RequirementBreakdownRequest;
import com.agent.mvp.coach.dto.RequirementBreakdownResponse;
import com.agent.mvp.coach.dto.ScaffoldFilePreview;
import com.agent.mvp.coach.dto.ScaffoldRequest;
import com.agent.mvp.coach.dto.ScaffoldResponse;
import com.agent.mvp.coach.dto.SentinelAlertResponse;
import com.agent.mvp.coach.dto.SentinelReportRequest;
import com.agent.mvp.coach.entity.DevCoachRun;
import com.agent.mvp.coach.repo.DevCoachRunRepository;
import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.config.MetricsSupport;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@org.springframework.context.annotation.Profile("legacy")
@Service
public class CoachService {
    private static final Logger log = LoggerFactory.getLogger(CoachService.class);

    private final ModelGateway modelGateway;
    private final CoachPromptService promptService;
    private final ScaffoldTemplateRegistry scaffoldTemplateRegistry;
    private final ScaffoldZipService scaffoldZipService;
    private final DevCoachRunRepository runRepository;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final RAGMemoryService ragMemoryService;
    private final UserService userService;
    private final SupervisorAgent supervisorAgent;
    private final CodeRAGService codeRAGService;
    private final SentinelAlertBroadcaster sentinelAlertBroadcaster;
    private final MeterRegistry meterRegistry;

    public CoachService(
            ModelGateway modelGateway,
            CoachPromptService promptService,
            ScaffoldTemplateRegistry scaffoldTemplateRegistry,
            ScaffoldZipService scaffoldZipService,
            DevCoachRunRepository runRepository,
            AppProperties appProperties,
            ObjectMapper objectMapper,
            RAGMemoryService ragMemoryService,
            UserService userService,
            SupervisorAgent supervisorAgent,
            CodeRAGService codeRAGService,
            SentinelAlertBroadcaster sentinelAlertBroadcaster,
            MeterRegistry meterRegistry) {
        this.modelGateway = modelGateway;
        this.promptService = promptService;
        this.scaffoldTemplateRegistry = scaffoldTemplateRegistry;
        this.scaffoldZipService = scaffoldZipService;
        this.runRepository = runRepository;
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.ragMemoryService = ragMemoryService;
        this.userService = userService;
        this.supervisorAgent = supervisorAgent;
        this.codeRAGService = codeRAGService;
        this.sentinelAlertBroadcaster = sentinelAlertBroadcaster;
        this.meterRegistry = meterRegistry;
    }

    public void handleSentinelReport(SentinelReportRequest request, UUID ownerUserId) {
        String report = sanitizeSentinelContent(request.stackTrace());
        try {
            log.info("Received sentinel report: source=sentinel, owner={}, length={}", ownerUserId, report.length());
            List<String> codeContext = codeRAGService.searchRelatedCode(report, 3);
            String contextStr = String.join("\n---\n", codeContext);
            LogDiagnosisAnalysis analysis =
                    analyzeLog(report, contextStr, null, null, null, null);
            SentinelAlertResponse alert =
                    new SentinelAlertResponse(
                            analysis.diagnosis().rootCause(), analysis.diagnosis().minimalFix());
            if (ownerUserId != null) sentinelAlertBroadcaster.publish(ownerUserId, alert);
            if (analysis.parseWarning() != null) {
                log.warn("Sentinel diagnosis parse warning: source=sentinel, owner={}, length={}", ownerUserId, report.length());
            }
        } catch (Exception ex) {
            log.warn("Failed to analyze sentinel report: source=sentinel, owner={}, length={}", ownerUserId, report.length());
            SentinelAlertResponse safeError =
                    new SentinelAlertResponse(
                            "Unable to generate structured diagnosis.",
                            "Inspect the stack trace and model provider configuration.");
            if (ownerUserId != null) sentinelAlertBroadcaster.publish(ownerUserId, safeError);
        }
    }

    private String sanitizeSentinelContent(String value) {
        String text = value == null ? "" : value;
        text = text.length() > 12000 ? text.substring(0, 12000) : text;
        return text.replaceAll(
                "(?i)(bearer\\s+|authorization\\s*[:=]\\s*|password|pwd|api[_-]?key|private_key|cookie|token)(\\s*[:=]\\s*|\\s+)[^\\s,;)]*",
                "$1$2***");
    }

    public RequirementBreakdownResponse breakdown(
            UUID userId, RequirementBreakdownRequest request) {
        // 指标埋点：需求拆解计数
        MetricsSupport.coachRequirementsBrokenDown(meterRegistry).increment();
        User user = Optional.ofNullable(userService.getUserById(userId)).orElse(null);
        ModelChatResponse modelResponse =
                modelGateway.chat(
                        resolveProvider(request.provider()),
                        new ModelChatRequest(
                                resolveModel(request.provider(), request.model()),
                                promptService.requirementMessages(request.requirement()),
                                List.of(),
                                "none",
                                user != null ? user.getCustomBaseUrl() : null,
                                user != null ? user.getCustomApiKey() : null));
        String raw = modelResponse.content() == null ? "" : modelResponse.content();
        Parsed<RequirementBreakdown> parsed = parseRequirementBreakdown(raw);
        DevCoachRun run =
                saveRun(
                        userId,
                        "REQUIREMENT_BREAKDOWN",
                        titleFrom(request.requirement()),
                        request.requirement(),
                        toJson(parsed.value()),
                        null);
        return new RequirementBreakdownResponse(run.getId(), parsed.value(), raw, parsed.warning());
    }

    public String executeMultiAgentTask(UUID userId, String requirement) {
        UUID runId = UUID.randomUUID();
        String result = supervisorAgent.executeTask(runId, requirement);
        // 记录多智能体执行 run，便于后续基于 runId 进行沙箱回滚或归档
        saveRun(userId, runId, "MULTI_AGENT", titleFrom(requirement), requirement, null, null);
        return result;
    }

    public LogDiagnosisResponse diagnose(UUID userId, LogDiagnosisRequest request) {
        User user = Optional.ofNullable(userService.getUserById(userId)).orElse(null);
        LogDiagnosisAnalysis analysis =
                analyzeLog(
                        request.logContent(),
                        request.context(),
                        request.provider(),
                        request.model(),
                        user != null ? user.getCustomBaseUrl() : null,
                        user != null ? user.getCustomApiKey() : null);
        DevCoachRun run =
                saveRun(
                        userId,
                        "LOG_DIAGNOSIS",
                        titleFrom(request.logContent()),
                        request.logContent(),
                        toJson(analysis.diagnosis()),
                        null);

        if (analysis.parseWarning() == null) {
            ragMemoryService.storeDiagnosis(
                    userId,
                    run.getId(),
                    analysis.diagnosis().symptom(),
                    analysis.diagnosis().rootCause(),
                    analysis.diagnosis().minimalFix());
        }

        return new LogDiagnosisResponse(
                run.getId(), analysis.diagnosis(), analysis.rawText(), analysis.parseWarning());
    }

    public ScaffoldResponse generateScaffold(UUID userId, ScaffoldRequest request) {
        // 指标埋点：脚手架生成计数
        MetricsSupport.coachScaffoldsGenerated(meterRegistry).increment();
        UUID runId = UUID.randomUUID();
        GeneratedScaffold scaffold = scaffoldTemplateRegistry.generate(request);
        Path zipPath = scaffoldZipService.writeZip(runId, scaffold);
        ScaffoldResponse response = toScaffoldResponse(runId, scaffold);
        saveRun(
                userId,
                runId,
                "SCAFFOLD",
                scaffold.projectName(),
                toJson(request),
                toJson(response),
                zipPath.toString());
        return response;
    }

    public Path findScaffoldArtifact(UUID userId, UUID runId) {
        DevCoachRun run =
                Optional.ofNullable(runRepository.selectById(runId))
                        .orElseThrow(() -> new NotFoundException("Coach run not found"));
        if (!run.getUserId().equals(userId)) {
            throw new ForbiddenException("Cannot download another user's scaffold");
        }
        if (!"SCAFFOLD".equals(run.getRunType())) {
            throw new NotFoundException("Scaffold artifact not found");
        }
        return scaffoldZipService.resolveOwnedArtifact(run.getArtifactPath());
    }

    public List<CoachRunResponse> listRuns(UUID userId, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 50));
        return runRepository
                .selectPage(
                        new Page<>(1, safeLimit),
                        new LambdaQueryWrapper<DevCoachRun>()
                                .eq(DevCoachRun::getUserId, userId)
                                .orderByDesc(DevCoachRun::getCreatedAt))
                .getRecords()
                .stream()
                .map(this::toRunResponse)
                .toList();
    }

    private ModelProviderType resolveProvider(ModelProviderType requested) {
        return requested == null ? appProperties.getDefaultProvider() : requested;
    }

    private String resolveModel(ModelProviderType provider, String requestedModel) {
        if (requestedModel != null && !requestedModel.isBlank()) {
            return requestedModel.trim();
        }
        return appProperties.getDefaultModel(resolveProvider(provider));
    }

    private LogDiagnosisAnalysis analyzeLog(
            String logContent,
            String context,
            ModelProviderType provider,
            String requestedModel,
            String customBaseUrl,
            String customApiKey) {
        ModelChatResponse modelResponse =
                modelGateway.chat(
                        resolveProvider(provider),
                        new ModelChatRequest(
                                resolveModel(provider, requestedModel),
                                promptService.logDiagnosisMessages(logContent, context),
                                List.of(),
                                "none",
                                customBaseUrl,
                                customApiKey));
        String raw = modelResponse.content() == null ? "" : modelResponse.content();
        Parsed<LogDiagnosis> parsed = parseLogDiagnosis(raw);
        return new LogDiagnosisAnalysis(parsed.value(), raw, parsed.warning());
    }

    private ScaffoldResponse toScaffoldResponse(UUID runId, GeneratedScaffold scaffold) {
        List<String> fileTree = scaffold.files().stream().map(ScaffoldFile::path).sorted().toList();
        List<ScaffoldFilePreview> previews =
                scaffold.files().stream()
                        .filter(
                                file ->
                                        file.path().endsWith("pom.xml")
                                                || file.path().endsWith("README.md")
                                                || file.path().endsWith("DevCoachService.java"))
                        .limit(4)
                        .map(file -> new ScaffoldFilePreview(file.path(), file.content()))
                        .toList();
        return new ScaffoldResponse(
                runId,
                scaffold.preset(),
                scaffold.projectName(),
                fileTree,
                previews,
                scaffold.startCommands(),
                "/api/v1/coach/scaffolds/" + runId + "/download");
    }

    private Parsed<RequirementBreakdown> parseRequirementBreakdown(String raw) {
        try {
            JsonNode node = objectMapper.readTree(stripCodeFence(raw));
            RequirementBreakdown value =
                    new RequirementBreakdown(
                            text(node, "goal", "Goal was not parsed; inspect rawText."),
                            items(node, "modules"),
                            items(node, "dataStructures"),
                            endpoints(node, "apiEndpoints"),
                            items(node, "risks"),
                            strings(node, "testPoints"));
            return new Parsed<>(value, null);
        } catch (Exception ex) {
            RequirementBreakdown fallback =
                    new RequirementBreakdown(
                            "Unable to parse model JSON; inspect rawText.",
                            List.of(),
                            List.of(),
                            List.of(),
                            List.of(new CoachItem("parse_warning", ex.getMessage())),
                            List.of("Retry with a shorter requirement or switch model."));
            return new Parsed<>(fallback, "Model output was not valid JSON: " + ex.getMessage());
        }
    }

    private Parsed<LogDiagnosis> parseLogDiagnosis(String raw) {
        try {
            JsonNode node = objectMapper.readTree(stripCodeFence(raw));
            LogDiagnosis value =
                    new LogDiagnosis(
                            text(node, "symptom", "Symptom was not parsed; inspect rawText."),
                            text(node, "rootCause", "Root cause was not parsed; inspect rawText."),
                            text(
                                    node,
                                    "triggerCondition",
                                    "Trigger condition was not parsed; inspect rawText."),
                            text(
                                    node,
                                    "minimalFix",
                                    "Minimal fix was not parsed; inspect rawText."),
                            strings(node, "verificationSteps"));
            return new Parsed<>(value, null);
        } catch (Exception ex) {
            LogDiagnosis fallback =
                    new LogDiagnosis(
                            "Unable to parse model JSON; inspect rawText.",
                            "Model returned non-JSON output.",
                            "Parser failed before structured diagnosis was available.",
                            "Retry with a smaller log slice or switch model.",
                            List.of(
                                    "Confirm the original error still reproduces.",
                                    "Retry diagnosis with the most relevant stack trace."));
            return new Parsed<>(fallback, "Model output was not valid JSON: " + ex.getMessage());
        }
    }

    private List<CoachItem> items(JsonNode node, String field) {
        List<CoachItem> out = new ArrayList<>();
        JsonNode array = node.get(field);
        if (array == null || !array.isArray()) {
            return out;
        }
        for (JsonNode item : array) {
            out.add(
                    new CoachItem(
                            text(item, "name", text(item, "title", "item")),
                            text(item, "description", "")));
        }
        return out;
    }

    private List<ApiEndpointPlan> endpoints(JsonNode node, String field) {
        List<ApiEndpointPlan> out = new ArrayList<>();
        JsonNode array = node.get(field);
        if (array == null || !array.isArray()) {
            return out;
        }
        for (JsonNode item : array) {
            out.add(
                    new ApiEndpointPlan(
                            text(item, "method", "POST"),
                            text(item, "path", "/api/todo"),
                            text(item, "purpose", "")));
        }
        return out;
    }

    private List<String> strings(JsonNode node, String field) {
        List<String> out = new ArrayList<>();
        JsonNode array = node.get(field);
        if (array == null || !array.isArray()) {
            return out;
        }
        for (JsonNode item : array) {
            out.add(item.isTextual() ? item.asText() : item.toString());
        }
        return out;
    }

    private String text(JsonNode node, String field, String fallback) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return fallback;
        }
        String text = value.asText();
        return text == null || text.isBlank() ? fallback : text;
    }

    private String stripCodeFence(String raw) {
        String text = raw == null ? "" : raw.trim();
        if (text.startsWith("```")) {
            int firstNewline = text.indexOf('\n');
            int lastFence = text.lastIndexOf("```");
            if (firstNewline >= 0 && lastFence > firstNewline) {
                return text.substring(firstNewline + 1, lastFence).trim();
            }
        }
        return text;
    }

    private DevCoachRun saveRun(
            UUID userId,
            String runType,
            String title,
            String inputText,
            String outputJson,
            String artifactPath) {
        return saveRun(
                userId, UUID.randomUUID(), runType, title, inputText, outputJson, artifactPath);
    }

    private DevCoachRun saveRun(
            UUID userId,
            UUID runId,
            String runType,
            String title,
            String inputText,
            String outputJson,
            String artifactPath) {
        DevCoachRun run = new DevCoachRun();
        run.setId(runId);
        run.setUserId(userId);
        run.setRunType(runType);
        run.setTitle(title);
        run.setInputText(inputText);
        run.setOutputJson(outputJson);
        run.setArtifactPath(artifactPath);
        run.onCreate();
        runRepository.insert(run);
        return run;
    }

    private CoachRunResponse toRunResponse(DevCoachRun run) {
        String downloadUrl =
                run.getArtifactPath() != null
                        ? "/api/v1/coach/scaffolds/" + run.getId() + "/download"
                        : null;
        return new CoachRunResponse(
                run.getId(),
                run.getRunType(),
                run.getTitle(),
                run.getInputText(),
                run.getOutputJson(),
                downloadUrl,
                run.getCreatedAt());
    }

    private String titleFrom(String text) {
        String value = text == null ? "Untitled" : text.replaceAll("\\s+", " ").trim();
        if (value.isBlank()) {
            return "Untitled";
        }
        return value.length() > 80 ? value.substring(0, 80) : value;
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private record Parsed<T>(T value, String warning) {}

    private record LogDiagnosisAnalysis(
            LogDiagnosis diagnosis, String rawText, String parseWarning) {}
}
