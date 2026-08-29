package com.agent.mvp.knowledge.service;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.modelsource.ModelSourceCheckStatus;
import com.agent.mvp.modelsource.ModelSourceProviderType;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.repo.ModelSourceRepository;
import com.agent.mvp.modelsource.service.ModelSourceProbeService;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.service.UserProfileService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class KnowledgeOrganizerService {

    private static final Pattern TOKEN_PATTERN =
            Pattern.compile("[A-Za-z][A-Za-z0-9.+#_-]{2,}|[\\u4e00-\\u9fa5]{2,8}");
    private static final Pattern JSON_FENCE_PATTERN =
            Pattern.compile(
                    "^```(?:json)?\\s*(.*?)\\s*```$", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final int MAX_MODEL_CONTENT_CHARS = 12_000;
    private static final int MAX_TAGS = 5;
    private static final int MAX_TAG_CHARS = 80;
    private static final int MAX_SUMMARY_CHARS = 500;
    private static final long LOCAL_MODEL_TIMEOUT_MS = 25_000L;

    private final ModelGateway modelGateway;
    private final ModelSourceRepository modelSourceRepository;
    private final UserProfileService userProfileService;
    private final ModelSourceProbeService modelSourceProbeService;
    private final ObjectMapper objectMapper;

    /**
     * Kept for existing lightweight unit tests. Production uses the explicitly autowired
     * constructor below and never falls through to a cloud model.
     */
    public KnowledgeOrganizerService() {
        this(null, null, null, null, new ObjectMapper());
    }

    @Autowired
    public KnowledgeOrganizerService(
            ModelGateway modelGateway,
            ModelSourceRepository modelSourceRepository,
            UserProfileService userProfileService,
            ModelSourceProbeService modelSourceProbeService,
            ObjectMapper objectMapper) {
        this.modelGateway = modelGateway;
        this.modelSourceRepository = modelSourceRepository;
        this.userProfileService = userProfileService;
        this.modelSourceProbeService = modelSourceProbeService;
        this.objectMapper = objectMapper;
    }

    public OrganizeResult organize(KnowledgeItem item) {
        String cleaned = normalize(item.getRawContent());
        try {
            ModelSource source = resolveModelSource(item.getUserId());
            if (source != null) {
                modelSourceProbeService.validateForUse(source);
                ModelOrganizeResponse modelResult = requestLocalOrganization(source, item, cleaned);
                String strategy =
                        ModelSourceProviderType.LOCAL_COMPATIBLE
                                        .value()
                                        .equalsIgnoreCase(source.getProviderType())
                                ? "local_model"
                                : "cloud_model";
                return new OrganizeResult(
                        cleaned,
                        modelResult.summary(),
                        modelResult.tags(),
                        detectLanguage(cleaned),
                        countWords(cleaned),
                        strategy);
            }
            return organizeHeuristically(item, cleaned, "heuristic");
        } catch (RuntimeException ex) {
            return organizeHeuristically(item, cleaned, "heuristic_fallback");
        }
    }

    private OrganizeResult organizeHeuristically(
            KnowledgeItem item, String cleaned, String organizationStrategy) {
        String summary = summarize(cleaned);
        List<String> tags = extractTags(item.getTitle(), cleaned, item.getSourceType());
        String language = detectLanguage(cleaned);
        int wordCount = countWords(cleaned);
        return new OrganizeResult(
                cleaned, summary, tags, language, wordCount, organizationStrategy);
    }

    private ModelSource resolveModelSource(UUID userId) {
        if (userId == null
                || modelSourceRepository == null
                || userProfileService == null
                || modelGateway == null
                || modelSourceProbeService == null) {
            return null;
        }
        UserProfile profile = userProfileService.getOrCreate(userId);
        ModelSource summarySource = eligibleModelSource(userId, profile.getSummaryModelSourceId());
        return summarySource != null
                ? summarySource
                : eligibleModelSource(userId, profile.getDefaultModelSourceId());
    }

    private ModelSource eligibleModelSource(UUID userId, UUID sourceId) {
        if (sourceId == null) {
            return null;
        }
        ModelSource source = modelSourceRepository.selectById(sourceId);
        if (source == null
                || !userId.equals(source.getUserId())
                || !Boolean.TRUE.equals(source.getEnabled())
                || !ModelSourceCheckStatus.OK.value().equalsIgnoreCase(source.getLastCheckStatus())
                || source.getDefaultModel() == null
                || source.getDefaultModel().isBlank()) {
            return null;
        }
        return source;
    }

    private ModelOrganizeResponse requestLocalOrganization(
            ModelSource source, KnowledgeItem item, String cleaned) {
        String baseUrl = normalizeBaseUrl(source.getBaseUrl());
        ModelChatResponse response =
                modelGateway.chat(
                        ModelProviderType.OPENAI,
                        new ModelChatRequest(
                                source.getDefaultModel().trim(),
                                List.of(
                                        ModelChatMessage.of(
                                                "system",
                                                """
You organize a private local knowledge item. Return exactly one JSON object and nothing else:
{"summary":"non-empty concise summary","tags":["non-empty concise tag"]}
Both summary and tags are required. tags must contain one to five short strings.
"""),
                                        ModelChatMessage.of(
                                                "user",
                                                "Title: "
                                                        + safeText(item.getTitle())
                                                        + "\nSource type: "
                                                        + safeText(item.getSourceType())
                                                        + "\nContent:\n"
                                                        + truncateForModel(cleaned))),
                                List.of(),
                                "none",
                                baseUrl,
                                safeApiKey(source.getApiKey()),
                                LOCAL_MODEL_TIMEOUT_MS));
        if (response == null || response.content() == null) {
            throw new IllegalArgumentException("Local model response is empty");
        }
        return parseModelOrganization(response.content());
    }

    private ModelOrganizeResponse parseModelOrganization(String raw) {
        try {
            JsonNode root = objectMapper.readTree(stripJsonFence(raw));
            if (root == null || !root.isObject()) {
                throw new IllegalArgumentException("Local model response must be a JSON object");
            }
            JsonNode summaryNode = root.path("summary");
            if (!summaryNode.isTextual()) {
                throw new IllegalArgumentException("Local model response summary is invalid");
            }
            String summary = normalize(summaryNode.asText());
            if (summary.isBlank()) {
                throw new IllegalArgumentException("Local model response summary is empty");
            }
            JsonNode tagsNode = root.path("tags");
            if (!tagsNode.isArray() || tagsNode.isEmpty()) {
                throw new IllegalArgumentException("Local model response tags are empty");
            }
            Set<String> tags = new LinkedHashSet<>();
            for (JsonNode tagNode : tagsNode) {
                if (!tagNode.isTextual()) {
                    throw new IllegalArgumentException("Local model response tags are invalid");
                }
                String tag = normalize(tagNode.asText());
                if (tag.isBlank()) {
                    throw new IllegalArgumentException("Local model response tags are invalid");
                }
                tags.add(truncate(tag.toLowerCase(Locale.ROOT), MAX_TAG_CHARS));
                if (tags.size() >= MAX_TAGS) {
                    break;
                }
            }
            if (tags.isEmpty()) {
                throw new IllegalArgumentException("Local model response tags are empty");
            }
            return new ModelOrganizeResponse(
                    truncate(summary, MAX_SUMMARY_CHARS), List.copyOf(tags));
        } catch (Exception ex) {
            throw new IllegalArgumentException(
                    "Local model response is not valid organization JSON");
        }
    }

    private String stripJsonFence(String raw) {
        String trimmed = raw == null ? "" : raw.trim();
        Matcher matcher = JSON_FENCE_PATTERN.matcher(trimmed);
        return matcher.matches() ? matcher.group(1).trim() : trimmed;
    }

    private String truncateForModel(String content) {
        return truncate(content, MAX_MODEL_CONTENT_CHARS);
    }

    private String safeText(String value) {
        return value == null ? "" : value;
    }

    private String normalizeBaseUrl(String baseUrl) {
        if (baseUrl == null) {
            return "";
        }
        String trimmed = baseUrl.trim();
        return trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
    }

    private String safeApiKey(String apiKey) {
        return apiKey == null || apiKey.isBlank() ? "sk-local-placeholder" : apiKey;
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value == null ? "" : value;
        }
        return value.substring(0, maxLength);
    }

    private String normalize(String raw) {
        return raw == null ? "" : raw.replaceAll("\\s+", " ").trim();
    }

    private String summarize(String cleaned) {
        if (cleaned.isBlank()) {
            return "";
        }
        return cleaned.length() <= 220 ? cleaned : cleaned.substring(0, 220) + "...";
    }

    private List<String> extractTags(String title, String cleaned, String sourceType) {
        String seed = (title == null ? "" : title + " ") + cleaned;
        Matcher matcher = TOKEN_PATTERN.matcher(seed);
        Set<String> tags = new LinkedHashSet<>();
        if (sourceType != null && !sourceType.isBlank()) {
            tags.add(sourceType.toLowerCase(Locale.ROOT));
        }
        while (matcher.find() && tags.size() < 5) {
            String token = matcher.group().trim().toLowerCase(Locale.ROOT);
            if (token.length() < 2 || isStopWord(token)) {
                continue;
            }
            tags.add(token);
        }
        return new ArrayList<>(tags);
    }

    private boolean isStopWord(String token) {
        return switch (token) {
            case "http",
                            "https",
                            "www",
                            "com",
                            "html",
                            "from",
                            "with",
                            "that",
                            "this",
                            "have",
                            "will",
                            "your",
                            "the",
                            "and",
                            "for",
                            "are",
                            "not",
                            "you",
                            "pdf",
                            "md" ->
                    true;
            default -> false;
        };
    }

    private String detectLanguage(String cleaned) {
        return cleaned.chars().anyMatch(ch -> ch >= 0x4E00 && ch <= 0x9FFF) ? "zh" : "en";
    }

    private int countWords(String cleaned) {
        if (cleaned.isBlank()) {
            return 0;
        }
        return cleaned.split("\\s+").length;
    }

    public record OrganizeResult(
            String cleanedContent,
            String summary,
            List<String> tags,
            String language,
            int wordCount,
            String organizationStrategy) {

        public OrganizeResult(
                String cleanedContent,
                String summary,
                List<String> tags,
                String language,
                int wordCount) {
            this(cleanedContent, summary, tags, language, wordCount, "heuristic");
        }
    }

    private record ModelOrganizeResponse(String summary, List<String> tags) {}
}
