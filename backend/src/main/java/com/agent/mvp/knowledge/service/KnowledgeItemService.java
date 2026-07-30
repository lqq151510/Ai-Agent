package com.agent.mvp.knowledge.service;

import com.agent.mvp.agent.dto.ParsedDocument;
import com.agent.mvp.agent.service.MarkItDownService;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.ConflictException;
import com.agent.mvp.common.exception.ForbiddenException;
import com.agent.mvp.common.exception.NotFoundException;
import com.agent.mvp.ingestion.IngestionJobStatus;
import com.agent.mvp.ingestion.IngestionJobType;
import com.agent.mvp.ingestion.entity.IngestionJob;
import com.agent.mvp.ingestion.service.IngestionJobService;
import com.agent.mvp.knowledge.KnowledgeItemSourceType;
import com.agent.mvp.knowledge.KnowledgeItemStatus;
import com.agent.mvp.knowledge.KnowledgeSourceAssetAvailability;
import com.agent.mvp.knowledge.KnowledgeSourceAssetOrigin;
import com.agent.mvp.knowledge.SourceUriSanitizer;
import com.agent.mvp.knowledge.dto.BatchOrganizeResponse;
import com.agent.mvp.knowledge.dto.CreateTagRequest;
import com.agent.mvp.knowledge.dto.DashboardRecentItemResponse;
import com.agent.mvp.knowledge.dto.DashboardSummaryResponse;
import com.agent.mvp.knowledge.dto.DashboardTagSummaryResponse;
import com.agent.mvp.knowledge.dto.ImportFileKnowledgeItemRequest;
import com.agent.mvp.knowledge.dto.ImportPreflightRequest;
import com.agent.mvp.knowledge.dto.ImportPreflightResponse;
import com.agent.mvp.knowledge.dto.ImportSnippetKnowledgeItemRequest;
import com.agent.mvp.knowledge.dto.ImportWebKnowledgeItemRequest;
import com.agent.mvp.knowledge.dto.KnowledgeItemPageResponse;
import com.agent.mvp.knowledge.dto.KnowledgeItemResponse;
import com.agent.mvp.knowledge.dto.KnowledgeSourceAssetResponse;
import com.agent.mvp.knowledge.dto.TagResponse;
import com.agent.mvp.knowledge.dto.UpdateKnowledgeItemRequest;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.knowledge.entity.KnowledgeItemTag;
import com.agent.mvp.knowledge.entity.KnowledgeSourceAsset;
import com.agent.mvp.knowledge.entity.KnowledgeTag;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemStatusCountView;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagView;
import com.agent.mvp.knowledge.repo.KnowledgeSourceAssetRepository;
import com.agent.mvp.knowledge.repo.KnowledgeTagRepository;
import com.agent.mvp.settings.OrganizeMode;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.service.UserProfileService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.regex.Pattern;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
public class KnowledgeItemService {
    private static final Logger log = LoggerFactory.getLogger(KnowledgeItemService.class);

    /**
     * Bounded thread pool for organize operations. Limited to 3 threads to avoid overwhelming the
     * LLM API while still allowing concurrent processing of batch organize requests.
     */
    private final ExecutorService organizeExecutor = Executors.newFixedThreadPool(
            3,
            r -> {
                Thread t = new Thread(r, "knowledge-organize");
                t.setDaemon(true);
                return t;
            });

    @PreDestroy
    void shutdownOrganizeExecutor() {
        organizeExecutor.shutdown();
        try {
            if (!organizeExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
                organizeExecutor.shutdownNow();
            }
        } catch (InterruptedException ex) {
            organizeExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    private static final String LIST_SUMMARY_SQL =
            "COALESCE(NULLIF(summary, ''), SUBSTRING(COALESCE(NULLIF(cleaned_content, ''),"
                    + " raw_content), 1, 280)) AS summary";
    private static final String SEARCH_VECTOR_SQL =
            "to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || "
                    + "COALESCE(NULLIF(cleaned_content, ''), raw_content, ''))";
    private static final int MAX_IMPORT_PREFLIGHT_HASHES = 20;
    private static final long MAX_SOURCE_ASSET_BYTES = 20L * 1024 * 1024;
    private static final Pattern SHA_256_HEX = Pattern.compile("^[0-9a-fA-F]{64}$");
    private static final String CONTENT_HASH_UNIQUE_CONSTRAINT =
            "uq_knowledge_items_user_content_hash";
    private static final String SOURCE_ASSET_ITEM_UNIQUE_CONSTRAINT =
            "uq_knowledge_source_assets_item";
    private static final int MAX_SOURCE_ASSET_FILENAME_CHARS = 512;

    private final KnowledgeItemRepository knowledgeItemRepository;
    private final KnowledgeSourceAssetRepository knowledgeSourceAssetRepository;
    private final KnowledgeTagRepository knowledgeTagRepository;
    private final KnowledgeItemTagRepository knowledgeItemTagRepository;
    private final IngestionJobService ingestionJobService;
    private final KnowledgeOrganizerService knowledgeOrganizerService;
    private final MarkItDownService markItDownService;
    private final UserProfileService userProfileService;
    private final ObjectMapper objectMapper;
    private final boolean postgresFullTextSearch;
    private final TransactionTemplate transactionTemplate;

    @Autowired
    public KnowledgeItemService(
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeSourceAssetRepository knowledgeSourceAssetRepository,
            KnowledgeTagRepository knowledgeTagRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository,
            IngestionJobService ingestionJobService,
            KnowledgeOrganizerService knowledgeOrganizerService,
            MarkItDownService markItDownService,
            UserProfileService userProfileService,
            ObjectMapper objectMapper,
            @Value("${spring.datasource.url:}") String datasourceUrl,
            PlatformTransactionManager transactionManager) {
        this(
                knowledgeItemRepository,
                knowledgeSourceAssetRepository,
                knowledgeTagRepository,
                knowledgeItemTagRepository,
                ingestionJobService,
                knowledgeOrganizerService,
                markItDownService,
                userProfileService,
                objectMapper,
                isPostgresDatasource(datasourceUrl),
                new TransactionTemplate(transactionManager));
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
                null,
                knowledgeTagRepository,
                knowledgeItemTagRepository,
                ingestionJobService,
                knowledgeOrganizerService,
                markItDownService,
                userProfileService,
                objectMapper,
                false,
                null);
    }

    public KnowledgeItemService(
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeSourceAssetRepository knowledgeSourceAssetRepository,
            KnowledgeTagRepository knowledgeTagRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository,
            IngestionJobService ingestionJobService,
            KnowledgeOrganizerService knowledgeOrganizerService,
            MarkItDownService markItDownService,
            UserProfileService userProfileService,
            ObjectMapper objectMapper) {
        this(
                knowledgeItemRepository,
                knowledgeSourceAssetRepository,
                knowledgeTagRepository,
                knowledgeItemTagRepository,
                ingestionJobService,
                knowledgeOrganizerService,
                markItDownService,
                userProfileService,
                objectMapper,
                false,
                null);
    }

    public KnowledgeItemService(
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeTagRepository knowledgeTagRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository,
            IngestionJobService ingestionJobService,
            KnowledgeOrganizerService knowledgeOrganizerService,
            MarkItDownService markItDownService,
            UserProfileService userProfileService,
            ObjectMapper objectMapper,
            boolean postgresFullTextSearch,
            TransactionTemplate transactionTemplate) {
        this(
                knowledgeItemRepository,
                null,
                knowledgeTagRepository,
                knowledgeItemTagRepository,
                ingestionJobService,
                knowledgeOrganizerService,
                markItDownService,
                userProfileService,
                objectMapper,
                postgresFullTextSearch,
                transactionTemplate);
    }

    KnowledgeItemService(
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeSourceAssetRepository knowledgeSourceAssetRepository,
            KnowledgeTagRepository knowledgeTagRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository,
            IngestionJobService ingestionJobService,
            KnowledgeOrganizerService knowledgeOrganizerService,
            MarkItDownService markItDownService,
            UserProfileService userProfileService,
            ObjectMapper objectMapper,
            boolean postgresFullTextSearch,
            TransactionTemplate transactionTemplate) {
        this.knowledgeItemRepository = knowledgeItemRepository;
        this.knowledgeSourceAssetRepository = knowledgeSourceAssetRepository;
        this.knowledgeTagRepository = knowledgeTagRepository;
        this.knowledgeItemTagRepository = knowledgeItemTagRepository;
        this.ingestionJobService = ingestionJobService;
        this.knowledgeOrganizerService = knowledgeOrganizerService;
        this.markItDownService = markItDownService;
        this.userProfileService = userProfileService;
        this.objectMapper = objectMapper;
        this.postgresFullTextSearch = postgresFullTextSearch;
        this.transactionTemplate = transactionTemplate;
    }

    private static boolean isPostgresDatasource(String datasourceUrl) {
        return datasourceUrl != null
                && datasourceUrl.toLowerCase(Locale.ROOT).startsWith("jdbc:postgresql:");
    }

    public KnowledgeItemResponse importWeb(UUID userId, ImportWebKnowledgeItemRequest request) {
        UserProfile profile = userProfileService.getOrCreate(userId);
        String sourceUri = SourceUriSanitizer.sanitize(request.url());
        String resolvedTitle = fallbackTitle(request.title(), SourceUriSanitizer.displayName(sourceUri));
        KnowledgeItem item =
                createImportedItem(
                        userId,
                        KnowledgeItemSourceType.WEB.value(),
                        resolvedTitle,
                        sourceUri,
                        request.content(),
                        toJson(Map.of("url", sourceUri, "title", resolvedTitle)),
                        null);
        return finalizeImportedItem(userId, item, profile);
    }

    public KnowledgeItemResponse importFile(UUID userId, ImportFileKnowledgeItemRequest request) {
        UserProfile profile = userProfileService.getOrCreate(userId);
        String sourceType = KnowledgeItemSourceType.from(request.sourceType()).value();
        if (KnowledgeItemSourceType.WEB.value().equals(sourceType)
                || KnowledgeItemSourceType.SNIPPET.value().equals(sourceType)) {
            throw new BadRequestException("File import only supports markdown or pdf source types");
        }
        String sourceUri = SourceUriSanitizer.sanitize(request.sourceUri());
        String resolvedTitle = fallbackTitle(request.title(), SourceUriSanitizer.displayName(sourceUri));
        KnowledgeItem item =
                createImportedItem(
                        userId,
                        sourceType,
                        resolvedTitle,
                        sourceUri,
                        request.content(),
                        toJson(
                                Map.of(
                                        "sourceType", sourceType,
                                        "sourceUri", sourceUri,
                                        "title", resolvedTitle)),
                        null);
        return finalizeImportedItem(userId, item, profile);
    }

    public KnowledgeItemResponse importUpload(UUID userId, MultipartFile file, String title) {
        return importUpload(userId, file, title, null, null);
    }

    public KnowledgeItemResponse importUpload(
            UUID userId,
            MultipartFile file,
            String title,
            String sourceAssetId,
            String sourceAssetOrigin) {
        UserProfile profile = userProfileService.getOrCreate(userId);
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("Uploaded file is required");
        }
        SourceAssetRequest sourceAssetRequest =
                normalizeSourceAssetRequest(sourceAssetId, sourceAssetOrigin);
        String originalFilename = file.getOriginalFilename();
        String sanitizedOriginalFilename = sanitizeFilename(originalFilename);
        String filenameMediaType = resolveKnownUploadMediaType(originalFilename);
        Path tempFile = null;
        try {
            tempFile = createTempFile(originalFilename);
            file.transferTo(tempFile);
            String contentHash = calculateSha256(tempFile);
            long byteSize = Files.size(tempFile);
            if (byteSize > MAX_SOURCE_ASSET_BYTES) {
                throw new BadRequestException("Uploaded file exceeds the 20 MiB limit");
            }
            KnowledgeItemResponse idempotentResponse =
                    findIdempotentSourceAssetImport(
                            userId,
                            sourceAssetRequest,
                            contentHash,
                            byteSize,
                            sanitizedOriginalFilename,
                            filenameMediaType);
            if (idempotentResponse != null) {
                return idempotentResponse;
            }
            if (contentHashExists(userId, contentHash)) {
                throw duplicateUploadConflict();
            }

            // Parse outside the transaction — markItDown may be slow and should not hold a DB
            // connection.
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
            String resolvedTitle =
                    fallbackTitle(title, resolveUploadTitle(parsed, originalFilename));
            String sourceUri = buildUploadSourceUri(originalFilename);
            SourceAssetImportDetails sourceAsset =
                    sourceAssetRequest == null
                            ? null
                            : new SourceAssetImportDetails(
                                    sourceAssetRequest.id(),
                                    contentHash,
                                    sanitizedOriginalFilename,
                                    resolveUploadMediaType(originalFilename, parsed.sourceFormat()),
                                    byteSize,
                                    sourceAssetRequest.origin(),
                                    KnowledgeSourceAssetAvailability.AVAILABLE.value());

            // Persist item + import-succeeded job in the same short transaction.
            final String jobMetadata =
                    toJson(
                            Map.of(
                                    "sourceType", sourceType,
                                    "sourceUri", sourceUri,
                                    "filename", sanitizeFilename(originalFilename),
                                    "title", resolvedTitle));
            KnowledgeItem item;
            try {
                item =
                        createImportedItem(
                                userId,
                                sourceType,
                                resolvedTitle,
                                sourceUri,
                                parsed.markdown(),
                                jobMetadata,
                                contentHash,
                                sourceAsset);
            } catch (DuplicateKeyException ex) {
                KnowledgeItemResponse idempotentAfterRace =
                        findIdempotentSourceAssetImport(
                                userId,
                                sourceAssetRequest,
                                contentHash,
                                byteSize,
                                sourceAsset == null
                                        ? sanitizedOriginalFilename
                                        : sourceAsset.originalFilename(),
                                sourceAsset == null ? filenameMediaType : sourceAsset.mediaType());
                if (idempotentAfterRace != null) {
                    return idempotentAfterRace;
                }
                throw uploadConflictFor(ex, sourceAsset != null);
            } catch (DataIntegrityViolationException ex) {
                KnowledgeItemResponse idempotentAfterRace =
                        findIdempotentSourceAssetImport(
                                userId,
                                sourceAssetRequest,
                                contentHash,
                                byteSize,
                                sourceAsset == null
                                        ? sanitizedOriginalFilename
                                        : sourceAsset.originalFilename(),
                                sourceAsset == null ? filenameMediaType : sourceAsset.mediaType());
                if (idempotentAfterRace != null) {
                    return idempotentAfterRace;
                }
                if (isContentHashConstraintViolation(ex)) {
                    throw duplicateUploadConflict();
                }
                if (sourceAsset != null && isSourceAssetConstraintViolation(ex)) {
                    throw managedSourceAssetConflict();
                }
                throw ex;
            }
            return finalizeImportedItem(userId, item, profile);
        } catch (IOException ex) {
            throw new BadRequestException("Failed to read uploaded file");
        } finally {
            deleteQuietly(tempFile);
        }
    }

    public ImportPreflightResponse preflightImport(
            UUID userId, ImportPreflightRequest request) {
        userProfileService.requireUser(userId);
        List<String> contentHashes = normalizeContentHashes(request.contentHashes());
        List<String> existingContentHashes =
                knowledgeItemRepository
                        .selectList(
                                new QueryWrapper<KnowledgeItem>()
                                        .select("content_hash")
                                        .eq("user_id", userId)
                                        .in("content_hash", contentHashes))
                        .stream()
                        .map(KnowledgeItem::getContentHash)
                        .filter(contentHash -> contentHash != null && !contentHash.isBlank())
                        .map(contentHash -> contentHash.toLowerCase(Locale.ROOT))
                        .distinct()
                        .toList();
        return new ImportPreflightResponse(
                contentHashes.stream().filter(existingContentHashes::contains).toList());
    }

    public KnowledgeItemResponse importSnippet(
            UUID userId, ImportSnippetKnowledgeItemRequest request) {
        UserProfile profile = userProfileService.getOrCreate(userId);
        String resolvedTitle = fallbackTitle(request.title(), "Snippet");
        KnowledgeItem item =
                createImportedItem(
                        userId,
                        KnowledgeItemSourceType.SNIPPET.value(),
                        resolvedTitle,
                        null,
                        request.content(),
                        toJson(Map.of("title", resolvedTitle, "sourceType", "snippet")),
                        null);
        return finalizeImportedItem(userId, item, profile);
    }

    public KnowledgeItemPageResponse listItems(
            UUID userId,
            List<String> statuses,
            String sourceType,
            String tag,
            Instant from,
            Instant to,
            long page,
            long pageSize) {
        Page<KnowledgeItem> itemPage =
                queryItems(
                        userId,
                        null,
                        normalizeStatuses(statuses),
                        sourceType,
                        tag,
                        from,
                        to,
                        page,
                        pageSize);
        return toPageResponse(itemPage);
    }

    public KnowledgeItemResponse getItem(UUID userId, UUID itemId) {
        return toResponse(requireOwnedItem(userId, itemId));
    }

    @Transactional
    public KnowledgeItemResponse updateItem(
            UUID userId, UUID itemId, UpdateKnowledgeItemRequest request) {
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
            String status,
            String tag,
            String sourceType,
            Instant from,
            Instant to,
            long page,
            long pageSize) {
        Page<KnowledgeItem> itemPage =
                queryItems(
                        userId,
                        query,
                        normalizeStatuses(status == null ? List.of() : List.of(status)),
                        sourceType,
                        tag,
                        from,
                        to,
                        page,
                        pageSize);
        return toPageResponse(itemPage);
    }

    public KnowledgeItemResponse organize(UUID userId, UUID itemId) {
        KnowledgeItem item = requireOwnedItem(userId, itemId);
        if (KnowledgeItemStatus.ARCHIVED.value().equals(item.getStatus())) {
            throw new BadRequestException("Archived item cannot be organized");
        }
        return runOrganize(userId, item, true, IngestionJobType.ORGANIZE.value());
    }

    public KnowledgeItemResponse reprocess(UUID userId, UUID itemId) {
        KnowledgeItem item = requireOwnedItem(userId, itemId);
        if (KnowledgeItemStatus.ARCHIVED.value().equals(item.getStatus())) {
            throw new BadRequestException("Archived item cannot be reprocessed");
        }
        return runOrganize(userId, item, true, IngestionJobType.REPROCESS.value());
    }

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
        // 并发执行 organize：每个任务在独立的短事务中运行（runOrganize 内部自带 @Transactional
        // 边界与事务模板），互不干扰。线程池有界（3 个），避免压垮 LLM API。
        List<CompletableFuture<KnowledgeItemResponse>> futures = items.stream()
                .map(item -> CompletableFuture.supplyAsync(
                        () -> runOrganize(userId, item, false, IngestionJobType.ORGANIZE.value()),
                        organizeExecutor))
                .toList();
        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                    .orTimeout(10, TimeUnit.MINUTES)
                    .join();
        } catch (CompletionException ex) {
            // 超时或未预期异常：记录日志，继续收集已完成任务的结果，不中断整体流程。
            log.warn("organizeBatch completed with exceptions for user {}", userId, ex);
        }

        List<UUID> processedItemIds = new ArrayList<>();
        List<UUID> failedItemIds = new ArrayList<>();
        for (CompletableFuture<KnowledgeItemResponse> future : futures) {
            if (!future.isDone() || future.isCancelled() || future.isCompletedExceptionally()) {
                continue;
            }
            KnowledgeItemResponse response = future.getNow(null);
            if (response == null) {
                continue;
            }
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
        // CAS claim + RUNNING job creation in the same short transaction.
        // This prevents orphaned PROCESSING items with no auditable job if a crash occurs between
        // them.
        final IngestionJob[] jobHolder = new IngestionJob[1];
        boolean claimed =
                txReturn(
                        status -> {
                            if (!claimForProcessing(userId, item.getId())) {
                                return Boolean.FALSE;
                            }
                            item.setStatus(KnowledgeItemStatus.PROCESSING.value());
                            jobHolder[0] =
                                    ingestionJobService.createRunning(
                                            userId,
                                            item.getId(),
                                            jobType,
                                            toJson(
                                                    Map.of(
                                                            "knowledgeItemId",
                                                            item.getId(),
                                                            "title",
                                                            item.getTitle())));
                            return Boolean.TRUE;
                        });
        if (!claimed) {
            if (rethrowOnFailure) {
                throw new BadRequestException("Item is already being processed");
            }
            return toResponse(item);
        }
        IngestionJob job = jobHolder[0];
        String previousCleanedContent = item.getCleanedContent();
        String previousSummary = item.getSummary();
        String previousLanguage = item.getLanguage();
        Integer previousWordCount = item.getWordCount();

        KnowledgeOrganizerService.OrganizeResult result;
        try {
            // AI call is outside any DB transaction to avoid holding connections during long
            // operations.
            result = knowledgeOrganizerService.organize(item);
        } catch (RuntimeException ex) {
            markOrganizeFailed(item, job, ex);
            if (rethrowOnFailure) {
                throw ex;
            }
            return toResponse(item);
        }

        try {
            String resultSnapshot =
                    toJson(
                            Map.of(
                                    "summary", result.summary(),
                                    "language", result.language(),
                                    "wordCount", result.wordCount(),
                                    "organizationStrategy", result.organizationStrategy(),
                                    "status", IngestionJobStatus.SUCCEEDED.value()));
            // Item, tags and job reach their success terminal state atomically.
            txWrite(
                    () -> {
                        item.setCleanedContent(result.cleanedContent());
                        item.setSummary(result.summary());
                        item.setLanguage(result.language());
                        item.setWordCount(result.wordCount());
                        item.setStatus(KnowledgeItemStatus.READY.value());
                        item.touch();
                        knowledgeItemRepository.updateById(item);
                        replaceTags(userId, item.getId(), result.tags());
                        ingestionJobService.markSucceeded(job, resultSnapshot);
                    });
            return toResponse(item);
        } catch (RuntimeException ex) {
            item.setCleanedContent(previousCleanedContent);
            item.setSummary(previousSummary);
            item.setLanguage(previousLanguage);
            item.setWordCount(previousWordCount);
            markOrganizeFailed(item, job, ex);
            if (rethrowOnFailure) {
                throw ex;
            }
            return toResponse(item);
        }
    }

    /**
     * Atomically claim an item for processing using a CAS (compare-and-swap) update. Only
     * transitions from non-PROCESSING, non-ARCHIVED states to PROCESSING. Returns false if another
     * request already claimed the item.
     */
    private boolean claimForProcessing(UUID userId, UUID itemId) {
        UpdateWrapper<KnowledgeItem> wrapper =
                new UpdateWrapper<KnowledgeItem>()
                        .eq("id", itemId)
                        .eq("user_id", userId)
                        .ne("status", KnowledgeItemStatus.PROCESSING.value())
                        .ne("status", KnowledgeItemStatus.ARCHIVED.value())
                        .set("status", KnowledgeItemStatus.PROCESSING.value())
                        .set("updated_at", Instant.now());
        return knowledgeItemRepository.update(null, wrapper) > 0;
    }

    /**
     * Execute a write operation in a short transaction. Falls back to direct execution when no
     * TransactionTemplate is configured (e.g. unit tests with mocks).
     */
    private void txWrite(Runnable action) {
        if (transactionTemplate == null) {
            action.run();
        } else {
            transactionTemplate.executeWithoutResult(status -> action.run());
        }
    }

    /** Execute a callback in a short transaction and return its result. */
    private <T> T txReturn(org.springframework.transaction.support.TransactionCallback<T> action) {
        if (transactionTemplate == null) {
            return action.doInTransaction(null);
        }
        return transactionTemplate.execute(action);
    }

    private KnowledgeItem createImportedItem(
            UUID userId,
            String sourceType,
            String title,
            String sourceUri,
            String content,
            String jobMetadata,
            String contentHash) {
        return createImportedItem(
                userId, sourceType, title, sourceUri, content, jobMetadata, contentHash, null);
    }

    private KnowledgeItem createImportedItem(
            UUID userId,
            String sourceType,
            String title,
            String sourceUri,
            String content,
            String jobMetadata,
            String contentHash,
            SourceAssetImportDetails sourceAsset) {
        return txReturn(
                status -> {
                    KnowledgeItem item =
                            createItem(
                                    userId,
                                    sourceType,
                                    title,
                                    sourceUri,
                                    content,
                                    KnowledgeItemStatus.INBOX.value(),
                                    contentHash);
                    if (sourceAsset != null) {
                        createSourceAsset(userId, item.getId(), sourceAsset);
                    }
                    ingestionJobService.createImportSucceeded(userId, item.getId(), jobMetadata);
                    return item;
                });
    }

    private void createSourceAsset(
            UUID userId, UUID knowledgeItemId, SourceAssetImportDetails sourceAsset) {
        if (knowledgeSourceAssetRepository == null) {
            throw new IllegalStateException("Knowledge source asset repository is not configured");
        }
        KnowledgeSourceAsset asset =
                KnowledgeSourceAsset.builder()
                        .id(sourceAsset.id())
                        .userId(userId)
                        .knowledgeItemId(knowledgeItemId)
                        .contentHash(sourceAsset.contentHash())
                        .originalFilename(sourceAsset.originalFilename())
                        .mediaType(sourceAsset.mediaType())
                        .byteSize(sourceAsset.byteSize())
                        .origin(sourceAsset.origin())
                        .availability(sourceAsset.availability())
                        .build();
        asset.onCreate();
        knowledgeSourceAssetRepository.insert(asset);
    }

    private KnowledgeItemResponse findIdempotentSourceAssetImport(
            UUID userId,
            SourceAssetRequest sourceAssetRequest,
            String contentHash,
            long byteSize,
            String originalFilename,
            String mediaType) {
        if (sourceAssetRequest == null || mediaType == null || knowledgeSourceAssetRepository == null) {
            return null;
        }
        KnowledgeSourceAsset existingAsset =
                knowledgeSourceAssetRepository.selectById(sourceAssetRequest.id());
        if (existingAsset == null) {
            return null;
        }
        if (!userId.equals(existingAsset.getUserId())
                || !contentHash.equals(existingAsset.getContentHash())
                || existingAsset.getByteSize() == null
                || byteSize != existingAsset.getByteSize()
                || !originalFilename.equals(existingAsset.getOriginalFilename())
                || !mediaType.equals(existingAsset.getMediaType())
                || !sourceAssetRequest.origin().equals(existingAsset.getOrigin())) {
            throw managedSourceAssetConflict();
        }
        KnowledgeItem existingItem =
                knowledgeItemRepository.selectById(existingAsset.getKnowledgeItemId());
        if (existingItem == null || !userId.equals(existingItem.getUserId())) {
            throw managedSourceAssetConflict();
        }
        return toResponse(existingItem);
    }

    private void markOrganizeFailed(
            KnowledgeItem item, IngestionJob job, RuntimeException failure) {
        txWrite(
                () -> {
                    item.setStatus(KnowledgeItemStatus.FAILED.value());
                    item.touch();
                    knowledgeItemRepository.updateById(item);
                    ingestionJobService.markFailed(job, failure.getMessage());
                });
    }

    private KnowledgeItemResponse finalizeImportedItem(
            UUID userId, KnowledgeItem item, UserProfile profile) {
        if (profile != null
                && OrganizeMode.AUTO.value().equalsIgnoreCase(profile.getOrganizeMode())) {
            return runOrganize(userId, item, false, IngestionJobType.ORGANIZE.value());
        }
        return toResponse(item);
    }

    @Transactional
    public KnowledgeItemResponse archive(UUID userId, UUID itemId) {
        KnowledgeItem item = requireOwnedItem(userId, itemId);
        Instant archivedAt = Instant.now();
        UpdateWrapper<KnowledgeItem> wrapper =
                new UpdateWrapper<KnowledgeItem>()
                        .eq("id", itemId)
                        .eq("user_id", userId)
                        .ne("status", KnowledgeItemStatus.PROCESSING.value())
                        .set("status", KnowledgeItemStatus.ARCHIVED.value())
                        .set("archived_at", archivedAt)
                        .set("updated_at", archivedAt);
        if (knowledgeItemRepository.update(null, wrapper) == 0) {
            throw new BadRequestException("Processing item cannot be archived");
        }
        item.setStatus(KnowledgeItemStatus.ARCHIVED.value());
        item.setArchivedAt(archivedAt);
        item.setUpdatedAt(archivedAt);
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

        Map<String, Long> statusCounts = getStatusCounts(userId);
        List<DashboardTagSummaryResponse> topTags =
                knowledgeItemTagRepository.findTopTagUsageByUserId(userId, 5).stream()
                        .map(
                                tag ->
                                        new DashboardTagSummaryResponse(
                                                tag.getTagId(),
                                                tag.getName(),
                                                tag.getColor(),
                                                tag.getUsageCount() == null
                                                        ? 0L
                                                        : tag.getUsageCount()))
                        .toList();
        long totalItems = statusCounts.values().stream().mapToLong(Long::longValue).sum();

        return new DashboardSummaryResponse(
                totalItems,
                statusCounts.getOrDefault(KnowledgeItemStatus.INBOX.value(), 0L),
                statusCounts.getOrDefault(KnowledgeItemStatus.READY.value(), 0L),
                statusCounts.getOrDefault(KnowledgeItemStatus.FAILED.value(), 0L),
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

    private Map<String, Long> getStatusCounts(UUID userId) {
        return knowledgeItemRepository.findStatusCountsByUserId(userId).stream()
                .collect(
                        Collectors.toMap(
                                KnowledgeItemStatusCountView::getStatus,
                                count -> count.getItemCount() == null ? 0L : count.getItemCount()));
    }

    private boolean contentHashExists(UUID userId, String contentHash) {
        Long matches =
                knowledgeItemRepository.selectCount(
                        new QueryWrapper<KnowledgeItem>()
                                .eq("user_id", userId)
                                .eq("content_hash", contentHash));
        return matches != null && matches > 0;
    }

    private String calculateSha256(Path file) throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 must be available", ex);
        }
        try (InputStream input = Files.newInputStream(file)) {
            byte[] buffer = new byte[8 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private List<String> normalizeContentHashes(List<String> contentHashes) {
        if (contentHashes == null
                || contentHashes.isEmpty()
                || contentHashes.size() > MAX_IMPORT_PREFLIGHT_HASHES) {
            throw new BadRequestException("contentHashes must contain 1 to 20 SHA-256 hashes");
        }
        return contentHashes.stream()
                .map(
                        contentHash -> {
                            if (contentHash == null || !SHA_256_HEX.matcher(contentHash).matches()) {
                                throw new BadRequestException(
                                        "content hash must be a 64-character hexadecimal SHA-256");
                            }
                            return contentHash.toLowerCase(Locale.ROOT);
                        })
                .distinct()
                .toList();
    }

    private SourceAssetRequest normalizeSourceAssetRequest(
            String sourceAssetId, String sourceAssetOrigin) {
        boolean hasAssetId = sourceAssetId != null && !sourceAssetId.isBlank();
        boolean hasOrigin = sourceAssetOrigin != null && !sourceAssetOrigin.isBlank();
        if (!hasAssetId) {
            if (hasOrigin) {
                throw new BadRequestException("sourceAssetOrigin requires sourceAssetId");
            }
            return null;
        }
        UUID id;
        try {
            id = UUID.fromString(sourceAssetId.trim());
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException("sourceAssetId must be a UUID");
        }
        String origin =
                hasOrigin
                        ? KnowledgeSourceAssetOrigin.from(sourceAssetOrigin).value()
                        : KnowledgeSourceAssetOrigin.PICKER.value();
        return new SourceAssetRequest(id, origin);
    }

    private ConflictException duplicateUploadConflict() {
        return new ConflictException("An identical file has already been imported");
    }

    private ConflictException managedSourceAssetConflict() {
        return new ConflictException("Managed source asset conflicts with an existing import");
    }

    private ConflictException uploadConflictFor(
            DuplicateKeyException exception, boolean sourceAssetRequested) {
        if (sourceAssetRequested && isSourceAssetConstraintViolation(exception)) {
            return managedSourceAssetConflict();
        }
        return duplicateUploadConflict();
    }

    private boolean isContentHashConstraintViolation(DataIntegrityViolationException exception) {
        return exceptionContains(exception, CONTENT_HASH_UNIQUE_CONSTRAINT);
    }

    private boolean isSourceAssetConstraintViolation(DataIntegrityViolationException exception) {
        return exceptionContains(exception, SOURCE_ASSET_ITEM_UNIQUE_CONSTRAINT);
    }

    private boolean exceptionContains(Throwable exception, String expectedText) {
        Throwable cause = exception;
        while (cause != null) {
            String message = cause.getMessage();
            if (message != null
                    && message.toLowerCase(Locale.ROOT)
                            .contains(expectedText.toLowerCase(Locale.ROOT))) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }

    private KnowledgeItem createItem(
            UUID userId,
            String sourceType,
            String title,
            String sourceUri,
            String content,
            String status,
            String contentHash) {
        String cleanedTitle = (title == null || title.isBlank()) ? "Untitled" : title.trim();
        KnowledgeItem item =
                KnowledgeItem.builder()
                        .userId(userId)
                        .sourceType(sourceType)
                        .title(cleanedTitle)
                        .sourceUri(SourceUriSanitizer.sanitize(sourceUri))
                        .contentHash(contentHash)
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
            List<String> statuses,
            String sourceType,
            String tag,
            Instant from,
            Instant to,
            long page,
            long pageSize) {
        Page<KnowledgeItem> pagination =
                new Page<>(Math.max(page, 1), Math.min(Math.max(pageSize, 1), 100));
        QueryWrapper<KnowledgeItem> wrapper =
                new QueryWrapper<KnowledgeItem>()
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
        if (!statuses.isEmpty()) {
            wrapper.in("status", statuses);
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
                    "SELECT 1 FROM knowledge_item_tags kit WHERE kit.knowledge_item_id ="
                            + " knowledge_items.id AND kit.tag_id ="
                            + " {0,typeHandler=com.agent.mvp.config.UuidTypeHandler}",
                    targetTag.getId());
        }
        wrapper.orderByDesc("updated_at");
        return knowledgeItemRepository.selectPage(pagination, wrapper);
    }

    private List<String> normalizeStatuses(List<String> rawStatuses) {
        if (rawStatuses == null || rawStatuses.isEmpty()) {
            return List.of();
        }
        return rawStatuses.stream()
                .filter(status -> status != null && !status.isBlank())
                .map(status -> KnowledgeItemStatus.from(status.trim()).value())
                .distinct()
                .toList();
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
        List<String> normalized = normalizeTagNames(tagNames);
        knowledgeItemTagRepository.deleteByKnowledgeItemId(itemId);
        if (normalized.isEmpty()) {
            return;
        }
        // 批量查询已存在的 tags：一次查询代替 N 次 selectOne。
        List<KnowledgeTag> existing =
                knowledgeTagRepository.selectList(
                        new LambdaQueryWrapper<KnowledgeTag>()
                                .eq(KnowledgeTag::getUserId, userId)
                                .in(KnowledgeTag::getName, normalized));
        Map<String, KnowledgeTag> tagByName =
                existing.stream()
                        .collect(Collectors.toMap(KnowledgeTag::getName, t -> t, (a, b) -> a));

        // 找出需要新建的 tags 并批量插入。
        List<KnowledgeTag> toCreate = new ArrayList<>();
        for (String name : normalized) {
            if (!tagByName.containsKey(name)) {
                KnowledgeTag tag =
                        KnowledgeTag.builder().userId(userId).name(name).color("#7a8a84").build();
                tag.onCreate();
                toCreate.add(tag);
                tagByName.put(name, tag);
            }
        }
        if (!toCreate.isEmpty()) {
            try {
                knowledgeTagRepository.insertBatch(toCreate);
            } catch (DataIntegrityViolationException ex) {
                // 并发场景下可能因 UNIQUE(user_id, name) 冲突导致批量插入失败，
                // 回退到逐条插入：冲突时 selectOne 获取已存在的 tag，保证正确性。
                for (KnowledgeTag tag : toCreate) {
                    try {
                        knowledgeTagRepository.insert(tag);
                    } catch (DuplicateKeyException dup) {
                        KnowledgeTag already =
                                knowledgeTagRepository.selectOne(
                                        new LambdaQueryWrapper<KnowledgeTag>()
                                                .eq(KnowledgeTag::getUserId, userId)
                                                .eq(KnowledgeTag::getName, tag.getName()));
                        if (already != null) {
                            tagByName.put(tag.getName(), already);
                        }
                    }
                }
            }
        }

        // 批量插入关联：一次批量插入代替 N 次 insert。
        List<KnowledgeItemTag> relations =
                normalized.stream()
                        .map(name -> new KnowledgeItemTag(itemId, tagByName.get(name).getId()))
                        .toList();
        if (!relations.isEmpty()) {
            knowledgeItemTagRepository.insertBatch(relations);
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
        return knowledgeTagRepository.selectBatchIds(tagIds).stream()
                .map(this::toTagResponse)
                .toList();
    }

    private KnowledgeItemPageResponse toPageResponse(Page<KnowledgeItem> itemPage) {
        List<UUID> itemIds = itemPage.getRecords().stream().map(KnowledgeItem::getId).toList();
        Map<UUID, List<TagResponse>> tagsByItemId =
                getTagsByItemIds(itemIds);
        Map<UUID, KnowledgeSourceAsset> sourceAssetsByItemId =
                getSourceAssetsByItemIds(itemIds);
        return new KnowledgeItemPageResponse(
                itemPage.getRecords().stream()
                        .map(
                                item ->
                                        toListResponse(
                                                item,
                                                tagsByItemId.getOrDefault(item.getId(), List.of()),
                                                sourceAssetsByItemId.get(item.getId())))
                        .toList(),
                itemPage.getTotal(),
                itemPage.getCurrent(),
                itemPage.getSize());
    }

    private Map<UUID, List<TagResponse>> getTagsByItemIds(List<UUID> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<TagResponse>> tagsByItemId = new HashMap<>();
        for (KnowledgeItemTagView tag :
                knowledgeItemTagRepository.findTagsByKnowledgeItemIds(itemIds)) {
            tagsByItemId
                    .computeIfAbsent(tag.getKnowledgeItemId(), ignored -> new ArrayList<>())
                    .add(
                            new TagResponse(
                                    tag.getTagId(),
                                    tag.getName(),
                                    tag.getColor(),
                                    tag.getCreatedAt()));
        }
        return tagsByItemId;
    }

    private Map<UUID, KnowledgeSourceAsset> getSourceAssetsByItemIds(List<UUID> itemIds) {
        if (knowledgeSourceAssetRepository == null || itemIds == null || itemIds.isEmpty()) {
            return Map.of();
        }
        return knowledgeSourceAssetRepository
                .selectList(
                        new LambdaQueryWrapper<KnowledgeSourceAsset>()
                                .in(KnowledgeSourceAsset::getKnowledgeItemId, itemIds))
                .stream()
                .collect(
                        Collectors.toMap(
                                KnowledgeSourceAsset::getKnowledgeItemId,
                                asset -> asset,
                                (first, ignored) -> first));
    }

    private TagResponse toTagResponse(KnowledgeTag tag) {
        return new TagResponse(tag.getId(), tag.getName(), tag.getColor(), tag.getCreatedAt());
    }

    private KnowledgeItemResponse toResponse(KnowledgeItem item) {
        return toResponse(item, getTags(item.getId()), true, getSourceAsset(item));
    }

    private KnowledgeItemResponse toResponse(KnowledgeItem item, List<TagResponse> tags) {
        return toResponse(item, tags, true, getSourceAsset(item));
    }

    private KnowledgeItemResponse toListResponse(
            KnowledgeItem item, List<TagResponse> tags, KnowledgeSourceAsset sourceAsset) {
        return toResponse(item, tags, false, sourceAsset);
    }

    private KnowledgeItemResponse toResponse(
            KnowledgeItem item,
            List<TagResponse> tags,
            boolean includeContent,
            KnowledgeSourceAsset sourceAsset) {
        return new KnowledgeItemResponse(
                item.getId(),
                item.getSourceType(),
                item.getTitle(),
                SourceUriSanitizer.sanitize(item.getSourceUri()),
                includeContent ? item.getRawContent() : null,
                includeContent ? item.getCleanedContent() : null,
                includeContent ? item.getSummary() : summaryForList(item),
                item.getStatus(),
                item.getLanguage(),
                item.getWordCount() == null ? 0 : item.getWordCount(),
                tags,
                item.getCreatedAt(),
                item.getUpdatedAt(),
                item.getArchivedAt(),
                toSourceAssetResponse(sourceAsset));
    }

    private KnowledgeSourceAsset getSourceAsset(KnowledgeItem item) {
        if (knowledgeSourceAssetRepository == null || item == null || item.getId() == null) {
            return null;
        }
        return knowledgeSourceAssetRepository.selectOne(
                new LambdaQueryWrapper<KnowledgeSourceAsset>()
                        .eq(KnowledgeSourceAsset::getUserId, item.getUserId())
                        .eq(KnowledgeSourceAsset::getKnowledgeItemId, item.getId()));
    }

    private KnowledgeSourceAssetResponse toSourceAssetResponse(KnowledgeSourceAsset sourceAsset) {
        if (sourceAsset == null) {
            return null;
        }
        return new KnowledgeSourceAssetResponse(
                sourceAsset.getId(),
                SourceUriSanitizer.safeBasename(
                        sourceAsset.getOriginalFilename(), "local-file"),
                sourceAsset.getMediaType(),
                sourceAsset.getByteSize() == null ? 0L : sourceAsset.getByteSize(),
                sourceAsset.getOrigin(),
                sourceAsset.getAvailability());
    }

    private String summaryForList(KnowledgeItem item) {
        if (item.getSummary() != null && !item.getSummary().isBlank()) {
            return item.getSummary();
        }
        String content =
                item.getCleanedContent() != null && !item.getCleanedContent().isBlank()
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
            default ->
                    throw new BadRequestException(
                            "Uploaded file type is not supported yet: " + format);
        };
    }

    private String resolveUploadMediaType(String filename, String parsedFormat) {
        String format = normalizeUploadFormat(parsedFormat, filename);
        return switch (format) {
            case "pdf" -> "application/pdf";
            case "md", "markdown" -> "text/markdown";
            case "txt" -> "text/plain";
            case "html", "htm" -> "text/html";
            default -> throw new BadRequestException("Uploaded file type is not supported");
        };
    }

    private String resolveKnownUploadMediaType(String filename) {
        String format = normalizeUploadFormat(null, filename);
        return switch (format) {
            case "pdf" -> "application/pdf";
            case "md", "markdown" -> "text/markdown";
            case "txt" -> "text/plain";
            case "html", "htm" -> "text/html";
            default -> null;
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
        String sanitized = SourceUriSanitizer.safeBasename(filename, "uploaded-file");
        if (sanitized.length() <= MAX_SOURCE_ASSET_FILENAME_CHARS) {
            return sanitized;
        }
        int dot = sanitized.lastIndexOf('.');
        String extension =
                dot > 0 && sanitized.length() - dot <= 64 ? sanitized.substring(dot) : "";
        return sanitized.substring(0, MAX_SOURCE_ASSET_FILENAME_CHARS - extension.length())
                + extension;
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
        if (suffix.length() > 64) {
            suffix = suffix.substring(0, 64);
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
        return text != null && text.chars().anyMatch(ch -> ch >= 0x4E00 && ch <= 0x9FFF)
                ? "zh"
                : "en";
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

    private record SourceAssetRequest(UUID id, String origin) {}

    private record SourceAssetImportDetails(
            UUID id,
            String contentHash,
            String originalFilename,
            String mediaType,
            long byteSize,
            String origin,
            String availability) {}
}
