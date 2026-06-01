package com.agent.mvp.coach.service;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import com.agent.mvp.agent.service.RAGMemoryService;
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
import com.agent.mvp.coach.entity.DevCoachRun;
import com.agent.mvp.coach.repo.DevCoachRunRepository;
import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class CoachService {

    private final ModelGateway modelGateway;
    private final CoachPromptService promptService;
    private final ScaffoldTemplateRegistry scaffoldTemplateRegistry;
    private final ScaffoldZipService scaffoldZipService;
    private final DevCoachRunRepository runRepository;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final RAGMemoryService ragMemoryService;

    public CoachService(ModelGateway modelGateway,
                        CoachPromptService promptService,
                        ScaffoldTemplateRegistry scaffoldTemplateRegistry,
                        ScaffoldZipService scaffoldZipService,
                        DevCoachRunRepository runRepository,
                        AppProperties appProperties,
                        ObjectMapper objectMapper,
                        RAGMemoryService ragMemoryService) {
        this.modelGateway = modelGateway;
        this.promptService = promptService;
        this.scaffoldTemplateRegistry = scaffoldTemplateRegistry;
        this.scaffoldZipService = scaffoldZipService;
        this.runRepository = runRepository;
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.ragMemoryService = ragMemoryService;
    }

    public RequirementBreakdownResponse breakdown(UUID userId, RequirementBreakdownRequest request) {
        ModelChatResponse modelResponse = modelGateway.chat(resolveProvider(request.provider()), new ModelChatRequest(
                resolveModel(request.provider(), request.model()),
                promptService.requirementMessages(request.requirement()),
                List.of(),
                "none"
        ));
        String raw = modelResponse.content() == null ? "" : modelResponse.content();
        Parsed<RequirementBreakdown> parsed = parseRequirementBreakdown(raw);
        DevCoachRun run = saveRun(userId, "REQUIREMENT_BREAKDOWN", titleFrom(request.requirement()), request.requirement(), toJson(parsed.value()), null);
        return new RequirementBreakdownResponse(run.getId(), parsed.value(), raw, parsed.warning());
    }

    public LogDiagnosisResponse diagnose(UUID userId, LogDiagnosisRequest request) {
        ModelChatResponse modelResponse = modelGateway.chat(resolveProvider(request.provider()), new ModelChatRequest(
                resolveModel(request.provider(), request.model()),
                promptService.logDiagnosisMessages(request.logContent(), request.context()),
                List.of(),
                "none"
        ));
        String raw = modelResponse.content() == null ? "" : modelResponse.content();
        Parsed<LogDiagnosis> parsed = parseLogDiagnosis(raw);
        DevCoachRun run = saveRun(userId, "LOG_DIAGNOSIS", titleFrom(request.logContent()), request.logContent(), toJson(parsed.value()), null);
        
        if (parsed.warning() == null) {
            ragMemoryService.storeDiagnosis(userId, run.getId(), parsed.value().symptom(), parsed.value().rootCause(), parsed.value().minimalFix());
        }

        return new LogDiagnosisResponse(run.getId(), parsed.value(), raw, parsed.warning());
    }

    public ScaffoldResponse generateScaffold(UUID userId, ScaffoldRequest request) {
        UUID runId = UUID.randomUUID();
        GeneratedScaffold scaffold = scaffoldTemplateRegistry.generate(request);
        Path zipPath = scaffoldZipService.writeZip(runId, scaffold);
        ScaffoldResponse response = toScaffoldResponse(runId, scaffold);
        saveRun(userId, runId, "SCAFFOLD", scaffold.projectName(), toJson(request), toJson(response), zipPath.toString());
        return response;
    }

    public Path findScaffoldArtifact(UUID userId, UUID runId) {
        DevCoachRun run = runRepository.findById(runId)
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
        return runRepository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, safeLimit))
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

    private ScaffoldResponse toScaffoldResponse(UUID runId, GeneratedScaffold scaffold) {
        List<String> fileTree = scaffold.files().stream()
                .map(ScaffoldFile::path)
                .sorted()
                .toList();
        List<ScaffoldFilePreview> previews = scaffold.files().stream()
                .filter(file -> file.path().endsWith("pom.xml") || file.path().endsWith("README.md") || file.path().endsWith("DevCoachService.java"))
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
                "/api/v1/coach/scaffolds/" + runId + "/download"
        );
    }

    private Parsed<RequirementBreakdown> parseRequirementBreakdown(String raw) {
        try {
            JsonNode node = objectMapper.readTree(stripCodeFence(raw));
            RequirementBreakdown value = new RequirementBreakdown(
                    text(node, "goal", "Goal was not parsed; inspect rawText."),
                    items(node, "modules"),
                    items(node, "dataStructures"),
                    endpoints(node, "apiEndpoints"),
                    items(node, "risks"),
                    strings(node, "testPoints")
            );
            return new Parsed<>(value, null);
        } catch (Exception ex) {
            RequirementBreakdown fallback = new RequirementBreakdown(
                    "Unable to parse model JSON; inspect rawText.",
                    List.of(),
                    List.of(),
                    List.of(),
                    List.of(new CoachItem("parse_warning", ex.getMessage())),
                    List.of("Retry with a shorter requirement or switch model.")
            );
            return new Parsed<>(fallback, "Model output was not valid JSON: " + ex.getMessage());
        }
    }

    private Parsed<LogDiagnosis> parseLogDiagnosis(String raw) {
        try {
            JsonNode node = objectMapper.readTree(stripCodeFence(raw));
            LogDiagnosis value = new LogDiagnosis(
                    text(node, "symptom", "Symptom was not parsed; inspect rawText."),
                    text(node, "rootCause", "Root cause was not parsed; inspect rawText."),
                    text(node, "triggerCondition", "Trigger condition was not parsed; inspect rawText."),
                    text(node, "minimalFix", "Minimal fix was not parsed; inspect rawText."),
                    strings(node, "verificationSteps")
            );
            return new Parsed<>(value, null);
        } catch (Exception ex) {
            LogDiagnosis fallback = new LogDiagnosis(
                    "Unable to parse model JSON; inspect rawText.",
                    "Model returned non-JSON output.",
                    "Parser failed before structured diagnosis was available.",
                    "Retry with a smaller log slice or switch model.",
                    List.of("Confirm the original error still reproduces.", "Retry diagnosis with the most relevant stack trace.")
            );
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
            out.add(new CoachItem(text(item, "name", text(item, "title", "item")), text(item, "description", "")));
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
            out.add(new ApiEndpointPlan(text(item, "method", "POST"), text(item, "path", "/api/todo"), text(item, "purpose", "")));
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

    private DevCoachRun saveRun(UUID userId, String runType, String title, String inputText, String outputJson, String artifactPath) {
        return saveRun(userId, UUID.randomUUID(), runType, title, inputText, outputJson, artifactPath);
    }

    private DevCoachRun saveRun(UUID userId, UUID runId, String runType, String title, String inputText, String outputJson, String artifactPath) {
        DevCoachRun run = new DevCoachRun();
        run.setId(runId);
        run.setUserId(userId);
        run.setRunType(runType);
        run.setTitle(title);
        run.setInputText(inputText);
        run.setOutputJson(outputJson);
        run.setArtifactPath(artifactPath);
        return runRepository.save(run);
    }

    private CoachRunResponse toRunResponse(DevCoachRun run) {
        return new CoachRunResponse(
                run.getId(),
                run.getRunType(),
                run.getTitle(),
                run.getInputText(),
                run.getOutputJson(),
                run.getArtifactPath(),
                run.getCreatedAt()
        );
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

    private record Parsed<T>(T value, String warning) {
    }
}
