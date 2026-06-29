package com.agent.mvp.knowledge.service;

import com.agent.mvp.agent.dto.ParsedDocument;
import com.agent.mvp.agent.service.MarkItDownService;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.ingestion.IngestionJobType;
import com.agent.mvp.ingestion.IngestionJobStatus;
import com.agent.mvp.ingestion.dto.IngestionJobResponse;
import com.agent.mvp.ingestion.entity.IngestionJob;
import com.agent.mvp.ingestion.service.IngestionJobService;
import com.agent.mvp.knowledge.KnowledgeItemSourceType;
import com.agent.mvp.knowledge.KnowledgeItemStatus;
import com.agent.mvp.knowledge.dto.BatchOrganizeResponse;
import com.agent.mvp.knowledge.dto.CreateTagRequest;
import com.agent.mvp.knowledge.dto.DashboardRecentItemResponse;
import com.agent.mvp.knowledge.dto.DashboardSummaryResponse;
import com.agent.mvp.knowledge.dto.DashboardTagSummaryResponse;
import com.agent.mvp.knowledge.dto.ImportFileKnowledgeItemRequest;
import com.agent.mvp.knowledge.dto.ImportSnippetKnowledgeItemRequest;
import com.agent.mvp.knowledge.dto.ImportWebKnowledgeItemRequest;
import com.agent.mvp.knowledge.dto.KnowledgeItemPageResponse;
import com.agent.mvp.knowledge.dto.KnowledgeItemResponse;
import com.agent.mvp.knowledge.dto.TagResponse;
import com.agent.mvp.knowledge.dto.UpdateKnowledgeItemRequest;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.knowledge.entity.KnowledgeItemTag;
import com.agent.mvp.knowledge.entity.KnowledgeTag;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagView;
import com.agent.mvp.knowledge.repo.KnowledgeTagUsageCountView;
import com.agent.mvp.knowledge.repo.KnowledgeTagRepository;
import com.agent.mvp.settings.OrganizeMode;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.service.UserProfileService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class KnowledgeItemService {
    private static final String LIST_SUMMARY_SQL =
            "COALESCE(NULLIF(summary, ''), SUBSTRING(COALESCE(NULLIF(cleaned_content, ''), raw_content), 1, 280)) AS summary";
    private static final String SEARCH_VECTOR_SQL =
            "to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || "
                    + "COALESCE(NULLIF(cleaned_content, ''), raw_content, ''))";

    private final KnowledgeItemRepository knowledgeItemRepository;
    private final KnowledgeTagRepository knowledgeTagRepository;
    private final KnowledgeItemTagRepository knowledgeItemTagRepository;
    private final IngestionJobService ingestionJobService;
    private final KnowledgeOrganizerService knowledgeOrganizerService;
    private final MarkItDownService markItDownService;
    private final UserProfileService userProfileService;
    private final ObjectMapper objectMapper;
    private final boolean postgresFullTextSearch;

    @Autowired
    public KnowledgeItemService(
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeTagRepository knowledgeTagRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository,
            IngestionJobService ingestionJobService,
            KnowledgeOrganizerService knowledgeOrganizerService,
            MarkItDownService markItDownService,
            UserProfileService userProfileService,
            ObjectMapper objectMapper,
            @Value("${spring.datasource.url:}") String datasourceUrl) {
        this(
                knowledgeItemRepository,
                knowledgeTagRepository,
                knowledgeItemTagRepository,
                ingestionJobService,
                knowledgeOrganizerService,
                markItDownService,
                userProfileService,
                objectMapper,
                isPostgresDatasource(datasourceUrl));
    }

    public KnowledgeItemService(
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeTagRepository knowledgeTagRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository,
            IngestionJobService ingestionJobService,
            KnowledgeOrganizerService knowledgeOrganizerService,
            MarkItDownService markItDownService,
            UserProfileService userProfileService,
            ObjectMapper objectMapper) {
        this(
                knowledgeItemRepository,
                knowledgeTagRepository,
                knowledgeItemTagRepository,
                ingestionJobService,
                knowledgeOrganizerService,
                markItDownService,
                userProfileService,
                objectMapper,
                false);
    }

    KnowledgeItemService(
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeTagRepository knowledgeTagRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository,
            IngestionJobService ingestionJobService,
            KnowledgeOrganizerService knowledgeOrganizerService,
            MarkItDownService markItDownService,
            UserProfileService userProfileService,
            ObjectMapper objectMapper,
            boolean postgresFullTextSearch) {
        this.knowledgeItemRepository = knowledgeItemRepository;
        this.knowledgeTagRepository = knowledgeTagRepository;
        this.knowledgeItemTagRepository = knowledgeItemTagRepository;
        this.ingestionJobService = ingestionJobService;
        this.knowledgeOrganizerService = knowledgeOrganizerService;
        this.markItDownService = markItDownService;
        this.userProfileService = userProfileService;
        this.objectMapper = objectMapper;
        this.postgresFullTextSearch = postgresFullTextSearch;
    }

    private static boolean isPostgresDatasource(String datasourceUrl) {
        return datasourceUrl != null && datasourceUrl.toLowerCase(Locale.ROOT).startsWith("jdbc:postgresql:");
    }

    @Transactional
    public KnowledgeItemResponse importWeb(UUID userId, ImportWebKnowledgeItemRequest request) {
        UserProfile profile = userProfileService.getOrCreate(userId);
        KnowledgeItem item =
                createItem(
                        userId,
                        KnowledgeItemSourceType.WEB.value(),
                        fallbackTitle(request.title(), request.url()),
                        request.url(),
                        request.content(),
                        KnowledgeItemStatus.INBOX.value());
        ingestionJobService.createImportSucceeded(
                userId, item.getId(), toJson(Map.of("url", request.url(), "title", item.getTitle())));
        return finalizeImportedItem(userId, item, profile);
    }

    @Transactional
    public KnowledgeItemResponse importFile(UUID userId, ImportFileKnowledgeItemRequest request) {
        UserProfile profile = userProfileService.getOrCreate(userId);
        String sourceType = KnowledgeItemSourceType.from(request.sourceType()).value();
        if (KnowledgeItemSourceType.WEB.value().equals(sourceType)
                || KnowledgeItemSourceType.SNIPPET.value().equals(sourceType)) {
            throw new BadRequestException("File import only supports markdown or pdf source types");
        }
        KnowledgeItem item =
                createItem(
                        userId,
                        sourceType,
                        fallbackTitle(request.title(), request.sourceUri()),
                        request.sourceUri(),
                        request.content(),
                        KnowledgeItemStatus.INBOX.value());
        ingestionJobService.createImportSucceeded(
                userId,
                item.getId(),
                toJson(Map.of("sourceType", sourceType, "sourceUri", request.sourceUri(), "title", item.getTitle())));
        return finalizeImportedItem(userId, item, profile);
    }

    @Transactional
    public KnowledgeItemResponse importUpload(UUID userId, MultipartFile file, String title) {
        UserProfile profile = userProfileService.getOrCreate(userId);
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("Uploaded file is required");
        }
        String originalFilename = file.getOriginalFilename();
        Path tempFile = null;
        try {
            tempFile = createTempFile(originalFilename);
            file.transferTo(tempFile);

            ParsedDocument parsed;
            try {
                parsed = markItDownService.parseDocument(tempFile.toFile());
            } catch (RuntimeException ex) {
                throw new BadRequestException("Uploaded file could not be parsed");
            }
            if (parsed == null || parsed.markdown() == null || parsed.markdown().isBlank()) {
                throw new BadRequestException("Uploaded file could not be parsed");
            }

            String sourceType = resolveUploadSourceType(originalFilename, parsed.sourceFormat());
            String resolvedTitle = fallbackTitle(title, resolveUploadTitle(parsed, originalFilename));
            String sourceUri = buildUploadSourceUri(originalFilename);

            KnowledgeItem item =
                    createItem(
                            userId,
                            sourceType,
                            resolvedTitle,
                            sourceUri,
                            parsed.markdown(),
                            KnowledgeItemStatus.INBOX.value());
            ingestionJobService.createImportSucceeded(
                    userId,
                    item.getId(),
                    toJson(
                            Map.of(
                                    "sourceType", sourceType,
                                    "sourceUri", sourceUri,
                                    "filename", sanitizeFilename(originalFilename),
                                    "title", item.getTitle())));
            return finalizeImportedItem(userId, item, profile);
        } catch (IOException ex) {
            throw new BadRequestException("Failed to read uploaded file");
        } finally {
            deleteQuietly(tempFile);
        }
    }

    @Transactional
    public KnowledgeItemResponse importSnippet(UUID userId, ImportSnippetKnowledgeItemRequest request) {
        UserProfile profile = userProfileService.getOrCreate(userId);
        KnowledgeItem item =
                createItem(
                        userId,
                        KnowledgeItemSourceType.SNIPPET.value(),
                        fallbackTitle(request.title(), "Snippet"),
                        null,
                        request.content(),
                        KnowledgeItemStatus.INBOX.value());
        ingestionJobService.createImportSucceeded(
                userId, item.getId(), toJson(Map.of("title", item.getTitle(), "sourceType", "snippet")));
        return finalizeImportedItem(userId, item, profile);
    }

    public KnowledgeItemPageResponse listItems(
            UUID userId, String status, String sourceType, String tag, long page, long pageSize) {
        Page<KnowledgeItem> itemPage = queryItems(userId, null, status, sourceType, tag, null, null, page, pageSize);
        return toPageResponse(itemPage, page, pageSize);
    }

    public KnowledgeItemResponse getItem(UUID userId, UUID itemId) {
        return toResponse(requireOwnedItem(userId, itemId));
    }

    @Transactional
    public KnowledgeItemResponse updateItem(UUID userId, UUID itemId, UpdateKnowledgeItemRequest request) {
        KnowledgeItem item = requireOwnedItem(userId, itemId);
        if (request.title() != null) {
            item.setTitle(request.title().trim());
        }
        if (request.summary() != null) {
            item.setSummary(request.summary().trim());
        }
        if (request.status() != null) {
            String newStatus = KnowledgeItemStatus.from(request.status()).value();
            if (KnowledgeItemStatus.ARCHIVED.value().equals(newStatus)) {
                throw new BadRequestException("Use archive endpoint to archive items");
            }
            item.setStatus(newStatus);
        }
        if (request.tags() != null) {
            replaceTags(userId, item.getId(), request.tags());
        }
        item.touch();
        knowledgeItemRepository.updateById(item);
        return toResponse(item);
    }

    public KnowledgeItemPageResponse search(
            UUID userId,
            String query,
            String tag,
            String sourceType,
            Instant from,
            Instant to,
            long page,
            long pageSize) {
        Page<KnowledgeItem> itemPage = queryItems(userId, query, null, sourceType, tag, from, to, page, pageSize);
        return toPageResponse(itemPage, page, pageSize);
    }

    @Transactional
    public KnowledgeItemResponse organize(UUID userId, UUID itemId) {
        KnowledgeItem item = requireOwnedItem(userId, itemId);
        if (KnowledgeItemStatus.ARCHIVED.value().equals(item.getStatus())) {
            throw new BadRequestException("Archived item cannot be organized");
        }
        if (KnowledgeItemStatus.PROCESSING.value().equals(item.getStatus())) {
            throw new BadRequestException("Processing item cannot be organized again");
        }
        return runOrganize(userId, item, true, IngestionJobType.ORGANIZE.value());
    }

    @Transactional
    public KnowledgeItemResponse reprocess(UUID userId, UUID itemId) {
        KnowledgeItem item = requireOwnedItem(userId, itemId);
        if (KnowledgeItemStatus.ARCHIVED.value().equals(item.getStatus())) {
            throw new BadRequestException("Archived item cannot be reprocessed");
        }
        if (KnowledgeItemStatus.PROCESSING.value().equals(item.getStatus())) {
            throw new BadRequestException("Processing item cannot be reprocessed");
        }
        return runOrganize(userId, item, true, IngestionJobType.REPROCESS.value());
    }

    @Transactional
    public BatchOrganizeResponse organizeBatch(UUID userId, int limit, boolean includeFailed) {
        userProfileService.requireUser(userId);
        int safeLimit = Math.min(Math.max(limit, 1), 100);

        LambdaQueryWrapper<KnowledgeItem> wrapper =
                new LambdaQueryWrapper<KnowledgeItem>().eq(KnowledgeItem::getUserId, userId);
        if (includeFailed) {
            wrapper.in(
                    KnowledgeItem::getStatus,
                    List.of(KnowledgeItemStatus.INBOX.value(), KnowledgeItemStatus.FAILED.value()));
        } else {
            wrapper.eq(KnowledgeItem::getStatus, KnowledgeItemStatus.INBOX.value());
        }
        wrapper.orderByAsc(KnowledgeItem::getCreatedAt).last("LIMIT " + safeLimit);

        List<KnowledgeItem> items = knowledgeItemRepository.selectList(wrapper);
        List<UUID> processedItemIds = new ArrayList<>();
        List<UUID> failedItemIds = new ArrayList<>();

        for (KnowledgeItem item : items) {
            KnowledgeItemResponse response =
                    runOrganize(userId, item, false, IngestionJobType.ORGANIZE.value());
            processedItemIds.add(response.id());
            if (KnowledgeItemStatus.FAILED.value().equals(response.status())) {
                failedItemIds.add(response.id());
            }
        }

        return new BatchOrganizeResponse(
                safeLimit,
                items.size(),
                processedItemIds.size() - failedItemIds.size(),
                failedItemIds.size(),
                List.copyOf(processedItemIds),
                List.copyOf(failedItemIds),
                Instant.now());
    }

    private KnowledgeItemResponse runOrganize(
            UUID userId, KnowledgeItem item, boolean rethrowOnFailure, String jobType) {
        item.setStatus(KnowledgeItemStatus.PROCESSING.value());
        item.touch();
        knowledgeItemRepository.updateById(item);

        IngestionJob job =
                ingestionJobService.createRunning(
                        userId,
                        item.getId(),
                        jobType,
                        toJson(Map.of("knowledgeItemId", item.getId(), "title", item.getTitle())));
        try {
            KnowledgeOrganizerService.OrganizeResult result = knowledgeOrganizerService.organize(item);
            item.setCleanedContent(result.cleanedContent());
            item.setSummary(result.summary());
            item.setLanguage(result.language());
            item.setWordCount(result.wordCount());
            item.setStatus(KnowledgeItemStatus.READY.value());
            item.touch();
            knowledgeItemRepository.updateById(item);
            replaceTags(userId, item.getId(), result.tags());
            ingestionJobService.markSucceeded(
                    job,
                    toJson(
                            Map.of(
                                    "summary", result.summary(),
                                    "language", result.language(),
                                    "wordCount", result.wordCount(),
                                    "status", IngestionJobStatus.SUCCEEDED.value())));
            return toResponse(item);
        } catch (RuntimeException ex) {
            item.setStatus(KnowledgeItemStatus.FAILED.value());
            item.touch();
            knowledgeItemRepository.updateById(item);
            ingestionJobService.markFailed(job, ex.getMessage());
            if (rethrowOnFailure) {
                throw ex;
            }
            return toResponse(item);
        }
    }

    private KnowledgeItemResponse finalizeImportedItem(UUID userId, KnowledgeItem item, UserProfile profile) {
        if (profile != null
                && OrganizeMode.AUTO.value().equalsIgnoreCase(profile.getOrganizeMode())) {
            return runOrganize(userId, item, false, IngestionJobType.ORGANIZE.value());
        }
        return toResponse(item);
    }

    @Transactional
    public KnowledgeItemResponse archive(UUID userId, UUID itemId) {
        KnowledgeItem item = requireOwnedItem(userId, itemId);
        item.setStatus(KnowledgeItemStatus.ARCHIVED.value());
        item.setArchivedAt(Instant.now());
        item.touch();
        knowledgeItemRepository.updateById(item);
        return toResponse(item);
    }

    @Transactional
    public KnowledgeItemResponse restore(UUID userId, UUID itemId) {
        KnowledgeItem item = requireOwnedItem(userId, itemId);
        item.setArchivedAt(null);
        item.setStatus(
                item.getSummary() != null && !item.getSummary().isBlank()
                        ? KnowledgeItemStatus.READY.value()
                        : KnowledgeItemStatus.INBOX.value());
        item.touch();
        knowledgeItemRepository.updateById(item);
        return toResponse(item);
    }

    public List<TagResponse> listTags(UUID userId) {
        userProfileService.requireUser(userId);
        return knowledgeTagRepository
                .selectList(
                        new LambdaQueryWrapper<KnowledgeTag>()
                                .eq(KnowledgeTag::getUserId, userId)
                                .orderByAsc(KnowledgeTag::getName))
                .stream()
                .map(this::toTagResponse)
                .toList();
    }

    @Transactional
    public TagResponse createTag(UUID userId, CreateTagRequest request) {
        userProfileService.requireUser(userId);
        KnowledgeTag existing =
                knowledgeTagRepository.selectOne(
                        new LambdaQueryWrapper<KnowledgeTag>()
                                .eq(KnowledgeTag::getUserId, userId)
                                .eq(KnowledgeTag::getName, request.name().trim()));
        if (existing != null) {
            return toTagResponse(existing);
        }
        KnowledgeTag tag =
                KnowledgeTag.builder()
                        .userId(userId)
                        .name(request.name().trim())
                        .color(request.color() == null ? "#7a8a84" : request.color().trim())
                        .build();
        tag.onCreate();
        knowledgeTagRepository.insert(tag);
        return toTagResponse(tag);
    }

    public DashboardSummaryResponse dashboardSummary(UUID userId) {
        userProfileService.requireUser(userId);
        List<KnowledgeItem> recentItems =
                knowledgeItemRepository.selectList(
                        new QueryWrapper<KnowledgeItem>()
                                .select("id", "title", "status", "source_type", "updated_at")
                                .eq("user_id", userId)
                                .orderByDesc("updated_at")
                                .last("LIMIT 5"));

        List<KnowledgeTag> tags =
                knowledgeTagRepository.selectList(
                        new LambdaQueryWrapper<KnowledgeTag>().eq(KnowledgeTag::getUserId, userId));
        Map<UUID, Long> tagUsageCounts =
                getTagUsageCounts(tags.stream().map(KnowledgeTag::getId).toList());
        List<DashboardTagSummaryResponse> topTags = tags.stream()
                .map(
                        tag ->
                                new DashboardTagSummaryResponse(
                                        tag.getId(),
                                        tag.getName(),
                                        tag.getColor(),
                                        tagUsageCounts.getOrDefault(tag.getId(), 0L)))
                .sorted(Comparator.comparingLong(DashboardTagSummaryResponse::usageCount).reversed())
                .limit(5)
                .toList();

        return new DashboardSummaryResponse(
                countItems(userId, null),
                countItems(userId, KnowledgeItemStatus.INBOX.value()),
                countItems(userId, KnowledgeItemStatus.READY.value()),
                countItems(userId, KnowledgeItemStatus.FAILED.value()),
                recentItems.stream()
                        .map(
                                item ->
                                        new DashboardRecentItemResponse(
                                                item.getId(),
                                                item.getTitle(),
                                                item.getStatus(),
                                                item.getSourceType(),
                                                item.getUpdatedAt()))
                        .toList(),
                topTags,
                Instant.now());
    }

    private Map<UUID, Long> getTagUsageCounts(List<UUID> tagIds) {
        if (tagIds == null || tagIds.isEmpty()) {
            return Map.of();
        }
        return knowledgeItemTagRepository.findUsageCountsByTagIds(tagIds).stream()
                .collect(Collectors.toMap(KnowledgeTagUsageCountView::getTagId, KnowledgeTagUsageCountView::getUsageCount));
    }

    private KnowledgeItem createItem(
            UUID userId, String sourceType, String title, String sourceUri, String content, String status) {
        String cleanedTitle = (title == null || title.isBlank()) ? "Untitled" : title.trim();
        KnowledgeItem item =
                KnowledgeItem.builder()
                        .userId(userId)
                        .sourceType(sourceType)
                        .title(cleanedTitle)
                        .sourceUri(sourceUri)
                        .rawContent(content.trim())
                        .status(status)
                        .language(detectLanguage(content))
                        .wordCount(countWords(content))
                        .build();
        item.onCreate();
        knowledgeItemRepository.insert(item);
        return item;
    }

    private Page<KnowledgeItem> queryItems(
            UUID userId,
            String query,
            String status,
            String sourceType,
            String tag,
            Instant from,
            Instant to,
            long page,
            long pageSize) {
        Page<KnowledgeItem> pagination = new Page<>(Math.max(page, 1), Math.min(Math.max(pageSize, 1), 100));
        QueryWrapper<KnowledgeItem> wrapper = new QueryWrapper<KnowledgeItem>()
                .select(
                        "id",
                        "user_id",
                        "source_type",
                        "title",
                        "source_uri",
                        LIST_SUMMARY_SQL,
                        "status",
                        "language",
                        "word_count",
                        "created_at",
                        "updated_at",
                        "archived_at")
                .eq("user_id", userId);

        if (query != null && !query.isBlank()) {
            applyKeywordSearch(wrapper, query.trim());
        }
        if (status != null && !status.isBlank()) {
            wrapper.eq("status", KnowledgeItemStatus.from(status).value());
        }
        if (sourceType != null && !sourceType.isBlank()) {
            wrapper.eq("source_type", KnowledgeItemSourceType.from(sourceType).value());
        }
        if (from != null) {
            wrapper.ge("created_at", from);
        }
        if (to != null) {
            wrapper.le("created_at", to);
        }
        if (tag != null && !tag.isBlank()) {
            KnowledgeTag targetTag =
                    knowledgeTagRepository.selectOne(
                            new LambdaQueryWrapper<KnowledgeTag>()
                                    .eq(KnowledgeTag::getUserId, userId)
                                    .eq(KnowledgeTag::getName, tag.trim()));
            if (targetTag == null) {
                return new Page<>(pagination.getCurrent(), pagination.getSize(), 0);
            }
            wrapper.exists(
                    "SELECT 1 FROM knowledge_item_tags kit "
                            + "WHERE kit.knowledge_item_id = knowledge_items.id "
                            + "AND kit.tag_id = {0,typeHandler=com.agent.mvp.config.UuidTypeHandler}",
                    targetTag.getId());
        }
        wrapper.orderByDesc("updated_at");
        return knowledgeItemRepository.selectPage(pagination, wrapper);
    }

    private void applyKeywordSearch(QueryWrapper<KnowledgeItem> wrapper, String query) {
        if (postgresFullTextSearch) {
            wrapper.apply(SEARCH_VECTOR_SQL + " @@ websearch_to_tsquery('simple', {0})", query);
            return;
        }
        wrapper.and(
                nested ->
                        nested.like("title", query)
                                .or()
                                .like("summary", query)
                                .or()
                                .like("cleaned_content", query));
    }

    private KnowledgeItem requireOwnedItem(UUID userId, UUID itemId) {
        KnowledgeItem item = knowledgeItemRepository.selectById(itemId);
        if (item == null) {
            throw new NotFoundException("Knowledge item not found");
        }
        if (!userId.equals(item.getUserId())) {
            throw new ForbiddenException("Cannot access another user's knowledge item");
        }
        return item;
    }

    private void replaceTags(UUID userId, UUID itemId, List<String> tagNames) {
        knowledgeItemTagRepository.deleteByKnowledgeItemId(itemId);
        for (String tagName : normalizeTagNames(tagNames)) {
            KnowledgeTag tag =
                    knowledgeTagRepository.selectOne(
                            new LambdaQueryWrapper<KnowledgeTag>()
                                    .eq(KnowledgeTag::getUserId, userId)
                                    .eq(KnowledgeTag::getName, tagName));
            if (tag == null) {
                tag =
                        KnowledgeTag.builder()
                                .userId(userId)
                                .name(tagName)
                                .color("#7a8a84")
                                .build();
                tag.onCreate();
                knowledgeTagRepository.insert(tag);
            }
            knowledgeItemTagRepository.insert(new KnowledgeItemTag(itemId, tag.getId()));
        }
    }

    private List<String> normalizeTagNames(List<String> tagNames) {
        if (tagNames == null) {
            return List.of();
        }
        Map<String, String> unique = new LinkedHashMap<>();
        for (String raw : tagNames) {
            if (raw == null || raw.isBlank()) {
                continue;
            }
            String normalized = raw.trim().toLowerCase();
            unique.putIfAbsent(normalized, normalized);
        }
        return new ArrayList<>(unique.values());
    }

    private List<TagResponse> getTags(UUID itemId) {
        List<UUID> tagIds = knowledgeItemTagRepository.findTagIdsByKnowledgeItemId(itemId);
        if (tagIds.isEmpty()) {
            return List.of();
        }
        return knowledgeTagRepository.selectBatchIds(tagIds).stream().map(this::toTagResponse).toList();
    }

    private KnowledgeItemPageResponse toPageResponse(Page<KnowledgeItem> itemPage, long page, long pageSize) {
        Map<UUID, List<TagResponse>> tagsByItemId =
                getTagsByItemIds(itemPage.getRecords().stream().map(KnowledgeItem::getId).toList());
        return new KnowledgeItemPageResponse(
                itemPage.getRecords().stream()
                        .map(item -> toListResponse(item, tagsByItemId.getOrDefault(item.getId(), List.of())))
                        .toList(),
                itemPage.getTotal(),
                page,
                pageSize);
    }

    private Map<UUID, List<TagResponse>> getTagsByItemIds(List<UUID> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<TagResponse>> tagsByItemId = new HashMap<>();
        for (KnowledgeItemTagView tag : knowledgeItemTagRepository.findTagsByKnowledgeItemIds(itemIds)) {
            tagsByItemId
                    .computeIfAbsent(tag.getKnowledgeItemId(), ignored -> new ArrayList<>())
                    .add(new TagResponse(tag.getTagId(), tag.getName(), tag.getColor(), tag.getCreatedAt()));
        }
        return tagsByItemId;
    }

    private TagResponse toTagResponse(KnowledgeTag tag) {
        return new TagResponse(tag.getId(), tag.getName(), tag.getColor(), tag.getCreatedAt());
    }

    private KnowledgeItemResponse toResponse(KnowledgeItem item) {
        return toResponse(item, getTags(item.getId()));
    }

    private KnowledgeItemResponse toResponse(KnowledgeItem item, List<TagResponse> tags) {
        return toResponse(item, tags, true);
    }

    private KnowledgeItemResponse toListResponse(KnowledgeItem item, List<TagResponse> tags) {
        return toResponse(item, tags, false);
    }

    private KnowledgeItemResponse toResponse(KnowledgeItem item, List<TagResponse> tags, boolean includeContent) {
        return new KnowledgeItemResponse(
                item.getId(),
                item.getSourceType(),
                item.getTitle(),
                item.getSourceUri(),
                includeContent ? item.getRawContent() : null,
                includeContent ? item.getCleanedContent() : null,
                includeContent ? item.getSummary() : summaryForList(item),
                item.getStatus(),
                item.getLanguage(),
                item.getWordCount() == null ? 0 : item.getWordCount(),
                tags,
                item.getCreatedAt(),
                item.getUpdatedAt(),
                item.getArchivedAt());
    }

    private String summaryForList(KnowledgeItem item) {
        if (item.getSummary() != null && !item.getSummary().isBlank()) {
            return item.getSummary();
        }
        String content = item.getCleanedContent() != null && !item.getCleanedContent().isBlank()
                ? item.getCleanedContent()
                : item.getRawContent();
        if (content == null || content.isBlank()) {
            return item.getSummary();
        }
        String normalized = content.replaceAll("\\s+", " ").trim();
        int maxLength = 280;
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength) + "...";
    }

    private long countItems(UUID userId, String status) {
        LambdaQueryWrapper<KnowledgeItem> wrapper =
                new LambdaQueryWrapper<KnowledgeItem>().eq(KnowledgeItem::getUserId, userId);
        if (status != null) {
            wrapper.eq(KnowledgeItem::getStatus, status);
        }
        return knowledgeItemRepository.selectCount(wrapper);
    }

    private String fallbackTitle(String title, String fallback) {
        if (title != null && !title.isBlank()) {
            return title.trim();
        }
        if (fallback == null || fallback.isBlank()) {
            return "Untitled";
        }
        return fallback.length() <= 240 ? fallback : fallback.substring(0, 240);
    }

    private String resolveUploadSourceType(String filename, String parsedFormat) {
        String format = normalizeUploadFormat(parsedFormat, filename);
        return switch (format) {
            case "pdf" -> KnowledgeItemSourceType.PDF.value();
            case "md", "markdown", "txt", "html", "htm" -> KnowledgeItemSourceType.MARKDOWN.value();
            default -> throw new BadRequestException("Uploaded file type is not supported yet: " + format);
        };
    }

    private String resolveUploadTitle(ParsedDocument parsed, String filename) {
        if (parsed != null && parsed.metadata() != null) {
            String metadataTitle = parsed.metadata().get("title");
            if (metadataTitle != null && !metadataTitle.isBlank()) {
                return metadataTitle.trim();
            }
        }
        return stripExtension(sanitizeFilename(filename));
    }

    private String normalizeUploadFormat(String parsedFormat, String filename) {
        if (parsedFormat != null && !parsedFormat.isBlank()) {
            return parsedFormat.trim().toLowerCase();
        }
        String sanitized = sanitizeFilename(filename);
        int dot = sanitized.lastIndexOf('.');
        if (dot < 0 || dot == sanitized.length() - 1) {
            return "";
        }
        return sanitized.substring(dot + 1).toLowerCase();
    }

    private String buildUploadSourceUri(String filename) {
        return "upload://" + sanitizeFilename(filename);
    }

    private String sanitizeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "uploaded-file";
        }
        return filename.replace("\\", "/").replaceAll("^.*/", "").trim();
    }

    private String stripExtension(String filename) {
        if (filename == null || filename.isBlank()) {
            return "Untitled";
        }
        int dot = filename.lastIndexOf('.');
        if (dot <= 0) {
            return filename;
        }
        return filename.substring(0, dot);
    }

    private Path createTempFile(String filename) throws IOException {
        String sanitized = sanitizeFilename(filename);
        String suffix = "";
        int dot = sanitized.lastIndexOf('.');
        if (dot >= 0) {
            suffix = sanitized.substring(dot);
        }
        return Files.createTempFile("knowledge-upload-", suffix);
    }

    private void deleteQuietly(Path tempFile) {
        if (tempFile == null) {
            return;
        }
        try {
            Files.deleteIfExists(tempFile);
        } catch (IOException ignored) {
            // Ignore temp file cleanup errors for upload flow.
        }
    }

    private String detectLanguage(String text) {
        return text != null && text.chars().anyMatch(ch -> ch >= 0x4E00 && ch <= 0x9FFF) ? "zh" : "en";
    }

    private int countWords(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        return text.trim().split("\\s+").length;
    }

    private String toJson(Map<String, ?> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize job payload", ex);
        }
    }
}
