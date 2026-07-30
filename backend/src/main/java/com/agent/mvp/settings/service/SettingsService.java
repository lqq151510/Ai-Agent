package com.agent.mvp.settings.service;

import com.agent.mvp.auth.entity.User;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.knowledge.KnowledgeItemSourceType;
import com.agent.mvp.knowledge.KnowledgeItemStatus;
import com.agent.mvp.knowledge.KnowledgeSourceAssetAvailability;
import com.agent.mvp.knowledge.KnowledgeSourceAssetOrigin;
import com.agent.mvp.knowledge.SourceUriSanitizer;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.knowledge.entity.KnowledgeItemTag;
import com.agent.mvp.knowledge.entity.KnowledgeSourceAsset;
import com.agent.mvp.knowledge.entity.KnowledgeTag;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagView;
import com.agent.mvp.knowledge.repo.KnowledgeSourceAssetRepository;
import com.agent.mvp.knowledge.repo.KnowledgeTagRepository;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.repo.ModelSourceRepository;
import com.agent.mvp.settings.OrganizeMode;
import com.agent.mvp.settings.PrivacyMode;
import com.agent.mvp.settings.dto.SettingsBackupKnowledgeItem;
import com.agent.mvp.settings.dto.SettingsBackupPayload;
import com.agent.mvp.settings.dto.SettingsBackupPreferences;
import com.agent.mvp.settings.dto.SettingsBackupSourceAsset;
import com.agent.mvp.settings.dto.SettingsBackupTag;
import com.agent.mvp.settings.dto.SettingsImportResponse;
import com.agent.mvp.settings.dto.SettingsProfileResponse;
import com.agent.mvp.settings.dto.SettingsStorageResponse;
import com.agent.mvp.settings.dto.UpdateSettingsProfileRequest;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.repo.UserProfileRepository;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SettingsService {

    private static final int BACKUP_SCHEMA_VERSION = 1;
    private static final int MAX_IMPORT_ITEMS = 1_000;
    private static final int MAX_IMPORT_TAGS = 5_000;
    private static final int MAX_TAGS_PER_ITEM = 25;
    private static final int MAX_ITEM_CONTENT_CHARS = 1_000_000;
    private static final int MAX_TOTAL_TEXT_CHARS = 10_000_000;
    private static final int MAX_SUMMARY_CHARS = 20_000;
    private static final int MAX_TITLE_CHARS = 240;
    private static final int MAX_SOURCE_URI_CHARS = 800;
    private static final int MAX_SOURCE_ASSET_FILENAME_CHARS = 512;
    private static final int MAX_SOURCE_ASSET_MEDIA_TYPE_CHARS = 120;
    private static final long MAX_SOURCE_ASSET_BYTES = 20L * 1024 * 1024;
    private static final int MAX_LANGUAGE_CHARS = 16;
    private static final int MAX_TAG_NAME_CHARS = 80;
    private static final int MAX_TAG_COLOR_CHARS = 24;
    private static final int MAX_DISPLAY_NAME_CHARS = 120;
    private static final int MAX_AVATAR_URL_CHARS = 500;

    private final UserProfileService userProfileService;
    private final UserProfileRepository userProfileRepository;
    private final ModelSourceRepository modelSourceRepository;
    private final KnowledgeItemRepository knowledgeItemRepository;
    private final KnowledgeSourceAssetRepository knowledgeSourceAssetRepository;
    private final KnowledgeTagRepository knowledgeTagRepository;
    private final KnowledgeItemTagRepository knowledgeItemTagRepository;

    @Autowired
    public SettingsService(
            UserProfileService userProfileService,
            UserProfileRepository userProfileRepository,
            ModelSourceRepository modelSourceRepository,
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeSourceAssetRepository knowledgeSourceAssetRepository,
            KnowledgeTagRepository knowledgeTagRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository) {
        this.userProfileService = userProfileService;
        this.userProfileRepository = userProfileRepository;
        this.modelSourceRepository = modelSourceRepository;
        this.knowledgeItemRepository = knowledgeItemRepository;
        this.knowledgeSourceAssetRepository = knowledgeSourceAssetRepository;
        this.knowledgeTagRepository = knowledgeTagRepository;
        this.knowledgeItemTagRepository = knowledgeItemTagRepository;
    }

    public SettingsService(
            UserProfileService userProfileService,
            UserProfileRepository userProfileRepository,
            ModelSourceRepository modelSourceRepository,
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeTagRepository knowledgeTagRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository) {
        this(
                userProfileService,
                userProfileRepository,
                modelSourceRepository,
                knowledgeItemRepository,
                null,
                knowledgeTagRepository,
                knowledgeItemTagRepository);
    }

    public SettingsProfileResponse getProfile(UUID userId) {
        User user = userProfileService.requireUser(userId);
        UserProfile profile = userProfileService.getOrCreate(userId);
        return toResponse(user, profile);
    }

    @Transactional
    public SettingsProfileResponse updateProfile(
            UUID userId, UpdateSettingsProfileRequest request) {
        User user = userProfileService.requireUser(userId);
        UserProfile profile = userProfileService.getOrCreate(userId);

        if (request.displayName() != null) {
            profile.setDisplayName(request.displayName().trim());
        }
        if (request.avatarUrl() != null) {
            profile.setAvatarUrl(request.avatarUrl().trim());
        }
        if (request.organizeMode() != null) {
            profile.setOrganizeMode(OrganizeMode.from(request.organizeMode()).value());
        }
        if (request.privacyMode() != null) {
            profile.setPrivacyMode(PrivacyMode.from(request.privacyMode()).value());
        }

        validateModelSourceOwnership(userId, request.defaultModelSourceId());
        validateModelSourceOwnership(userId, request.summaryModelSourceId());
        validateModelSourceOwnership(userId, request.taggingModelSourceId());

        validateClearFlag(
                "defaultModelSourceId",
                request.defaultModelSourceId(),
                request.clearDefaultModelSource());
        validateClearFlag(
                "summaryModelSourceId",
                request.summaryModelSourceId(),
                request.clearSummaryModelSource());
        validateClearFlag(
                "taggingModelSourceId",
                request.taggingModelSourceId(),
                request.clearTaggingModelSource());

        if (request.defaultModelSourceId() != null) {
            syncDefaultModelSource(userId, request.defaultModelSourceId());
            profile.setDefaultModelSourceId(request.defaultModelSourceId());
        } else if (Boolean.TRUE.equals(request.clearDefaultModelSource())) {
            clearDefaultModelSource(userId);
            profile.setDefaultModelSourceId(null);
        }
        if (request.summaryModelSourceId() != null) {
            profile.setSummaryModelSourceId(request.summaryModelSourceId());
        } else if (Boolean.TRUE.equals(request.clearSummaryModelSource())) {
            profile.setSummaryModelSourceId(null);
        }
        if (request.taggingModelSourceId() != null) {
            profile.setTaggingModelSourceId(request.taggingModelSourceId());
        } else if (Boolean.TRUE.equals(request.clearTaggingModelSource())) {
            profile.setTaggingModelSourceId(null);
        }

        userProfileService.save(profile);
        return toResponse(user, profile);
    }

    public SettingsStorageResponse getStorage(UUID userId) {
        long totalItems = countItems(userId, null);
        return new SettingsStorageResponse(
                totalItems,
                countItems(userId, "inbox"),
                countItems(userId, "ready"),
                countItems(userId, "failed"),
                countItems(userId, "archived"),
                knowledgeTagRepository.selectCount(
                        new LambdaQueryWrapper<com.agent.mvp.knowledge.entity.KnowledgeTag>()
                                .eq(
                                        com.agent.mvp.knowledge.entity.KnowledgeTag::getUserId,
                                        userId)),
                modelSourceRepository.selectCount(
                        new LambdaQueryWrapper<ModelSource>().eq(ModelSource::getUserId, userId)),
                Instant.now());
    }

    @Transactional(readOnly = true)
    public SettingsBackupPayload exportBackup(UUID userId) {
        userProfileService.requireUser(userId);
        UserProfile profile = userProfileRepository.selectById(userId);
        List<KnowledgeTag> tags =
                knowledgeTagRepository.selectList(
                        new LambdaQueryWrapper<KnowledgeTag>()
                                .eq(KnowledgeTag::getUserId, userId)
                                .orderByAsc(KnowledgeTag::getCreatedAt));
        List<KnowledgeItem> items =
                knowledgeItemRepository.selectList(
                        new LambdaQueryWrapper<KnowledgeItem>()
                                .eq(KnowledgeItem::getUserId, userId)
                                .orderByAsc(KnowledgeItem::getCreatedAt));
        Map<UUID, List<UUID>> tagIdsByItem = collectTagIdsByItem(items);
        Map<UUID, KnowledgeSourceAsset> sourceAssetsByItem = collectSourceAssetsByItem(items);

        return new SettingsBackupPayload(
                BACKUP_SCHEMA_VERSION,
                Instant.now(),
                toBackupPreferences(profile),
                tags.stream()
                        .map(
                                tag ->
                                        new SettingsBackupTag(
                                                tag.getId(),
                                                tag.getName(),
                                                tag.getColor(),
                                                tag.getCreatedAt()))
                        .toList(),
                items.stream()
                        .map(
                                item ->
                                        new SettingsBackupKnowledgeItem(
                                                item.getId(),
                                                item.getSourceType(),
                                                item.getTitle(),
                                                SourceUriSanitizer.sanitize(item.getSourceUri()),
                                                item.getRawContent(),
                                                item.getCleanedContent(),
                                                item.getSummary(),
                                                item.getStatus(),
                                                item.getLanguage(),
                                                item.getWordCount() == null
                                                        ? 0
                                                        : item.getWordCount(),
                                                item.getCreatedAt(),
                                                item.getUpdatedAt(),
                                                item.getArchivedAt(),
                                                toBackupSourceAsset(
                                                        sourceAssetsByItem.get(item.getId())),
                                                tagIdsByItem.getOrDefault(item.getId(), List.of())))
                        .toList(),
                false);
    }

    @Transactional
    public SettingsImportResponse importBackup(UUID userId, SettingsBackupPayload backup) {
        userProfileService.requireUser(userId);
        ImportPlan plan = validateImportBackup(backup);
        Map<String, KnowledgeTag> tagsByNormalizedName = loadTagsByNormalizedName(userId);
        Map<UUID, KnowledgeTag> importedTags = new HashMap<>();
        int createdTags = 0;

        List<KnowledgeTag> tagsToInsert = new ArrayList<>();
        for (ImportTagPlan sourceTag : plan.tags()) {
            KnowledgeTag targetTag = tagsByNormalizedName.get(sourceTag.normalizedName());
            if (targetTag == null) {
                targetTag =
                        KnowledgeTag.builder()
                                .userId(userId)
                                .name(sourceTag.name())
                                .color(sourceTag.color())
                                .createdAt(sourceTag.createdAt())
                                .build();
                targetTag.onCreate();
                tagsToInsert.add(targetTag);
                tagsByNormalizedName.put(sourceTag.normalizedName(), targetTag);
                createdTags++;
            }
            importedTags.put(sourceTag.id(), targetTag);
        }
        if (!tagsToInsert.isEmpty()) {
            knowledgeTagRepository.insertBatch(tagsToInsert);
        }

        List<KnowledgeItem> itemsToInsert = new ArrayList<>();
        for (ImportItemPlan sourceItem : plan.items()) {
            KnowledgeItem importedItem =
                    KnowledgeItem.builder()
                            .userId(userId)
                            .sourceType(sourceItem.sourceType())
                            .title(sourceItem.title())
                            .sourceUri(sourceItem.sourceUri())
                            .rawContent(sourceItem.rawContent())
                            .cleanedContent(sourceItem.cleanedContent())
                            .summary(sourceItem.summary())
                            .status(sourceItem.status())
                            .language(sourceItem.language())
                            .wordCount(sourceItem.wordCount())
                            .createdAt(sourceItem.createdAt())
                            .updatedAt(sourceItem.updatedAt())
                            .archivedAt(sourceItem.archivedAt())
                            .build();
            importedItem.onCreate();
            itemsToInsert.add(importedItem);
        }
        if (!itemsToInsert.isEmpty()) {
            knowledgeItemRepository.insertBatch(itemsToInsert);
        }

        List<KnowledgeItemTag> itemTagsToInsert = new ArrayList<>();
        for (int i = 0; i < plan.items().size(); i++) {
            ImportItemPlan sourceItem = plan.items().get(i);
            KnowledgeItem importedItem = itemsToInsert.get(i);
            if (sourceItem.sourceAsset() != null) {
                createMissingSourceAsset(userId, importedItem.getId(), sourceItem.sourceAsset());
            }
            for (UUID tagId : sourceItem.tagIds()) {
                itemTagsToInsert.add(
                        new KnowledgeItemTag(
                                importedItem.getId(), importedTags.get(tagId).getId()));
            }
        }
        if (!itemTagsToInsert.isEmpty()) {
            knowledgeItemTagRepository.insertBatch(itemTagsToInsert);
        }

        return new SettingsImportResponse(
                plan.items().size(),
                createdTags,
                false,
                false,
                "Knowledge items and tags were merged. Preferences and model sources were not"
                        + " restored.");
    }

    private SettingsBackupPreferences toBackupPreferences(UserProfile profile) {
        if (profile == null) {
            return new SettingsBackupPreferences(null, null, "manual", "local_first");
        }
        return new SettingsBackupPreferences(
                profile.getDisplayName(),
                profile.getAvatarUrl(),
                defaultIfBlank(profile.getOrganizeMode(), "manual"),
                defaultIfBlank(profile.getPrivacyMode(), "local_first"));
    }

    private Map<UUID, List<UUID>> collectTagIdsByItem(List<KnowledgeItem> items) {
        if (items.isEmpty()) {
            return Map.of();
        }
        Map<UUID, List<UUID>> tagIdsByItem = new HashMap<>();
        for (KnowledgeItemTagView relation :
                knowledgeItemTagRepository.findTagsByKnowledgeItemIds(
                        items.stream().map(KnowledgeItem::getId).toList())) {
            if (relation.getKnowledgeItemId() != null && relation.getTagId() != null) {
                tagIdsByItem
                        .computeIfAbsent(
                                relation.getKnowledgeItemId(), ignored -> new ArrayList<>())
                        .add(relation.getTagId());
            }
        }
        return tagIdsByItem;
    }

    private Map<UUID, KnowledgeSourceAsset> collectSourceAssetsByItem(
            List<KnowledgeItem> items) {
        if (knowledgeSourceAssetRepository == null || items.isEmpty()) {
            return Map.of();
        }
        Map<UUID, KnowledgeSourceAsset> sourceAssetsByItem = new HashMap<>();
        for (KnowledgeSourceAsset sourceAsset :
                knowledgeSourceAssetRepository.selectList(
                        new LambdaQueryWrapper<KnowledgeSourceAsset>()
                                .in(
                                        KnowledgeSourceAsset::getKnowledgeItemId,
                                        items.stream().map(KnowledgeItem::getId).toList()))) {
            if (sourceAsset != null && sourceAsset.getKnowledgeItemId() != null) {
                sourceAssetsByItem.putIfAbsent(sourceAsset.getKnowledgeItemId(), sourceAsset);
            }
        }
        return sourceAssetsByItem;
    }

    private SettingsBackupSourceAsset toBackupSourceAsset(KnowledgeSourceAsset sourceAsset) {
        if (sourceAsset == null) {
            return null;
        }
        return new SettingsBackupSourceAsset(
                sourceAsset.getId(),
                SourceUriSanitizer.safeBasename(sourceAsset.getOriginalFilename(), "local-file"),
                sourceAsset.getMediaType(),
                sourceAsset.getByteSize(),
                sourceAsset.getOrigin(),
                sourceAsset.getAvailability());
    }

    private void createMissingSourceAsset(
            UUID userId, UUID knowledgeItemId, SourceAssetBackupPlan sourceAsset) {
        if (knowledgeSourceAssetRepository == null) {
            throw new IllegalStateException("Knowledge source asset repository is not configured");
        }
        KnowledgeSourceAsset restoredAsset =
                KnowledgeSourceAsset.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .knowledgeItemId(knowledgeItemId)
                        .contentHash(null)
                        .originalFilename(sourceAsset.originalFilename())
                        .mediaType(sourceAsset.mediaType())
                        .byteSize(sourceAsset.byteSize())
                        .origin(sourceAsset.origin())
                        .availability(KnowledgeSourceAssetAvailability.MISSING.value())
                        .build();
        restoredAsset.onCreate();
        knowledgeSourceAssetRepository.insert(restoredAsset);
    }

    private Map<String, KnowledgeTag> loadTagsByNormalizedName(UUID userId) {
        Map<String, KnowledgeTag> tagsByNormalizedName = new LinkedHashMap<>();
        for (KnowledgeTag tag :
                knowledgeTagRepository.selectList(
                        new LambdaQueryWrapper<KnowledgeTag>()
                                .eq(KnowledgeTag::getUserId, userId))) {
            if (tag != null && tag.getName() != null && !tag.getName().isBlank()) {
                tagsByNormalizedName.putIfAbsent(normalizeTagName(tag.getName()), tag);
            }
        }
        return tagsByNormalizedName;
    }

    private ImportPlan validateImportBackup(SettingsBackupPayload backup) {
        if (backup == null) {
            throw new BadRequestException("Backup payload is required");
        }
        if (!Integer.valueOf(BACKUP_SCHEMA_VERSION).equals(backup.schemaVersion())) {
            throw new BadRequestException("Unsupported backup schemaVersion");
        }
        if (backup.exportedAt() == null) {
            throw new BadRequestException("Backup exportedAt is required");
        }
        if (!Boolean.FALSE.equals(backup.modelSourcesIncluded())) {
            throw new BadRequestException("Backup must not include model sources");
        }

        validatePreferences(backup.preferences());
        List<SettingsBackupTag> tags = requiredList(backup.tags(), "tags");
        List<SettingsBackupKnowledgeItem> items =
                requiredList(backup.knowledgeItems(), "knowledgeItems");
        if (tags.size() > MAX_IMPORT_TAGS) {
            throw new BadRequestException("Backup contains too many tags");
        }
        if (items.size() > MAX_IMPORT_ITEMS) {
            throw new BadRequestException("Backup contains too many knowledge items");
        }

        Map<UUID, ImportTagPlan> tagsById = new LinkedHashMap<>();
        Map<String, ImportTagPlan> tagsByNormalizedName = new LinkedHashMap<>();
        for (SettingsBackupTag tag : tags) {
            ImportTagPlan tagPlan = validateTag(tag);
            if (tagsById.putIfAbsent(tagPlan.id(), tagPlan) != null) {
                throw new BadRequestException("Backup contains duplicate tag IDs");
            }
            if (tagsByNormalizedName.putIfAbsent(tagPlan.normalizedName(), tagPlan) != null) {
                throw new BadRequestException("Backup contains duplicate tag names");
            }
        }

        Set<UUID> itemIds = new HashSet<>();
        List<ImportItemPlan> itemPlans = new ArrayList<>();
        long totalTextChars = 0;
        for (SettingsBackupKnowledgeItem item : items) {
            ImportItemPlan itemPlan = validateItem(item, tagsById.keySet());
            if (!itemIds.add(itemPlan.id())) {
                throw new BadRequestException("Backup contains duplicate knowledge item IDs");
            }
            totalTextChars += itemPlan.title().length();
            totalTextChars += itemPlan.rawContent().length();
            totalTextChars += lengthOf(itemPlan.sourceUri());
            totalTextChars += lengthOf(itemPlan.cleanedContent());
            totalTextChars += lengthOf(itemPlan.summary());
            if (totalTextChars > MAX_TOTAL_TEXT_CHARS) {
                throw new BadRequestException("Backup text content exceeds the import limit");
            }
            itemPlans.add(itemPlan);
        }
        return new ImportPlan(List.copyOf(tagsById.values()), List.copyOf(itemPlans));
    }

    private void validatePreferences(SettingsBackupPreferences preferences) {
        if (preferences == null) {
            throw new BadRequestException("Backup preferences are required");
        }
        optionalText(preferences.displayName(), MAX_DISPLAY_NAME_CHARS, "preferences.displayName");
        optionalText(preferences.avatarUrl(), MAX_AVATAR_URL_CHARS, "preferences.avatarUrl");
        OrganizeMode.from(
                requiredText(preferences.organizeMode(), 24, "preferences.organizeMode").trim());
        PrivacyMode.from(
                requiredText(preferences.privacyMode(), 24, "preferences.privacyMode").trim());
    }

    private ImportTagPlan validateTag(SettingsBackupTag tag) {
        if (tag == null || tag.id() == null) {
            throw new BadRequestException("Each backup tag requires an ID");
        }
        if (tag.createdAt() == null) {
            throw new BadRequestException("Each backup tag requires createdAt");
        }
        String name = requiredText(tag.name(), MAX_TAG_NAME_CHARS, "tags.name").trim();
        return new ImportTagPlan(
                tag.id(),
                name,
                normalizeTagName(name),
                optionalText(tag.color(), MAX_TAG_COLOR_CHARS, "tags.color"),
                tag.createdAt());
    }

    private ImportItemPlan validateItem(SettingsBackupKnowledgeItem item, Set<UUID> backupTagIds) {
        if (item == null || item.id() == null) {
            throw new BadRequestException("Each backup knowledge item requires an ID");
        }
        String sourceType =
                KnowledgeItemSourceType.from(
                                requiredText(item.sourceType(), 24, "knowledgeItems.sourceType")
                                        .trim())
                        .value();
        String status =
                KnowledgeItemStatus.from(
                                requiredText(item.status(), 24, "knowledgeItems.status").trim())
                        .value();
        String title = requiredText(item.title(), MAX_TITLE_CHARS, "knowledgeItems.title").trim();
        String rawContent =
                requiredText(
                        item.rawContent(), MAX_ITEM_CONTENT_CHARS, "knowledgeItems.rawContent");
        String cleanedContent =
                optionalText(
                        item.cleanedContent(),
                        MAX_ITEM_CONTENT_CHARS,
                        "knowledgeItems.cleanedContent");
        String summary = optionalText(item.summary(), MAX_SUMMARY_CHARS, "knowledgeItems.summary");
        String sourceUri =
                SourceUriSanitizer.sanitize(
                        optionalText(
                                item.sourceUri(),
                                MAX_SOURCE_URI_CHARS,
                                "knowledgeItems.sourceUri"));
        SourceAssetBackupPlan sourceAsset = validateSourceAsset(item.sourceAsset());
        String language =
                optionalText(item.language(), MAX_LANGUAGE_CHARS, "knowledgeItems.language");
        if (item.wordCount() == null || item.wordCount() < 0) {
            throw new BadRequestException("knowledgeItems.wordCount must be non-negative");
        }
        if (item.createdAt() == null || item.updatedAt() == null) {
            throw new BadRequestException(
                    "Each backup knowledge item requires createdAt and updatedAt");
        }
        if (item.updatedAt().isBefore(item.createdAt())) {
            throw new BadRequestException("knowledgeItems.updatedAt cannot be before createdAt");
        }
        if (KnowledgeItemStatus.ARCHIVED.value().equals(status) && item.archivedAt() == null) {
            throw new BadRequestException("Archived knowledge items require archivedAt");
        }
        if (!KnowledgeItemStatus.ARCHIVED.value().equals(status) && item.archivedAt() != null) {
            throw new BadRequestException("Only archived knowledge items may include archivedAt");
        }
        List<UUID> tagIds = requiredList(item.tagIds(), "knowledgeItems.tagIds");
        if (tagIds.size() > MAX_TAGS_PER_ITEM) {
            throw new BadRequestException("A knowledge item has too many tags");
        }
        Set<UUID> uniqueTagIds = new HashSet<>();
        for (UUID tagId : tagIds) {
            if (tagId == null || !backupTagIds.contains(tagId)) {
                throw new BadRequestException("Knowledge item references an unknown backup tag");
            }
            if (!uniqueTagIds.add(tagId)) {
                throw new BadRequestException("Knowledge item contains duplicate tag references");
            }
        }
        return new ImportItemPlan(
                item.id(),
                sourceType,
                title,
                sourceUri,
                rawContent,
                cleanedContent,
                summary,
                status,
                language,
                item.wordCount(),
                item.createdAt(),
                item.updatedAt(),
                item.archivedAt(),
                sourceAsset,
                List.copyOf(tagIds));
    }

    private SourceAssetBackupPlan validateSourceAsset(SettingsBackupSourceAsset sourceAsset) {
        if (sourceAsset == null) {
            return null;
        }
        if (sourceAsset.id() == null) {
            throw new BadRequestException("knowledgeItems.sourceAsset.id is required");
        }
        String originalFilename =
                SourceUriSanitizer.safeBasename(
                        requiredText(
                                sourceAsset.originalFilename(),
                                MAX_SOURCE_ASSET_FILENAME_CHARS,
                                "knowledgeItems.sourceAsset.originalFilename"),
                        "local-file");
        String mediaType =
                requiredText(
                                sourceAsset.mediaType(),
                                MAX_SOURCE_ASSET_MEDIA_TYPE_CHARS,
                                "knowledgeItems.sourceAsset.mediaType")
                        .trim();
        if (sourceAsset.byteSize() == null
                || sourceAsset.byteSize() < 0
                || sourceAsset.byteSize() > MAX_SOURCE_ASSET_BYTES) {
            throw new BadRequestException("knowledgeItems.sourceAsset.byteSize is invalid");
        }
        String origin =
                KnowledgeSourceAssetOrigin.from(
                                requiredText(
                                        sourceAsset.origin(),
                                        32,
                                        "knowledgeItems.sourceAsset.origin"))
                        .value();
        KnowledgeSourceAssetAvailability.from(
                requiredText(
                        sourceAsset.availability(),
                        24,
                        "knowledgeItems.sourceAsset.availability"));
        return new SourceAssetBackupPlan(originalFilename, mediaType, sourceAsset.byteSize(), origin);
    }

    private <T> List<T> requiredList(List<T> values, String fieldName) {
        if (values == null) {
            throw new BadRequestException(fieldName + " is required");
        }
        return values;
    }

    private String requiredText(String value, int maxLength, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException(fieldName + " is required");
        }
        if (value.length() > maxLength) {
            throw new BadRequestException(fieldName + " exceeds the allowed length");
        }
        return value;
    }

    private String optionalText(String value, int maxLength, String fieldName) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (value.length() > maxLength) {
            throw new BadRequestException(fieldName + " exceeds the allowed length");
        }
        return value.trim();
    }

    private String normalizeTagName(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private int lengthOf(String value) {
        return value == null ? 0 : value.length();
    }

    private String defaultIfBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private record ImportPlan(List<ImportTagPlan> tags, List<ImportItemPlan> items) {}

    private record ImportTagPlan(
            UUID id, String name, String normalizedName, String color, Instant createdAt) {}

    private record ImportItemPlan(
            UUID id,
            String sourceType,
            String title,
            String sourceUri,
            String rawContent,
            String cleanedContent,
            String summary,
            String status,
            String language,
            Integer wordCount,
            Instant createdAt,
            Instant updatedAt,
            Instant archivedAt,
            SourceAssetBackupPlan sourceAsset,
            List<UUID> tagIds) {}

    private record SourceAssetBackupPlan(
            String originalFilename, String mediaType, long byteSize, String origin) {}

    private void validateModelSourceOwnership(UUID userId, UUID modelSourceId) {
        if (modelSourceId == null) {
            return;
        }
        ModelSource source = modelSourceRepository.selectById(modelSourceId);
        if (source == null || !userId.equals(source.getUserId())) {
            throw new BadRequestException("Model source does not belong to current user");
        }
    }

    private void validateClearFlag(String fieldName, UUID modelSourceId, Boolean clearFlag) {
        if (modelSourceId != null && Boolean.TRUE.equals(clearFlag)) {
            throw new BadRequestException(
                    "Cannot set and clear " + fieldName + " at the same time");
        }
    }

    private void syncDefaultModelSource(UUID userId, UUID defaultModelSourceId) {
        modelSourceRepository.syncDefault(userId, defaultModelSourceId, Instant.now());
    }

    private void clearDefaultModelSource(UUID userId) {
        modelSourceRepository.clearDefaultByUserId(userId, Instant.now());
    }

    private long countItems(UUID userId, String status) {
        LambdaQueryWrapper<com.agent.mvp.knowledge.entity.KnowledgeItem> wrapper =
                new LambdaQueryWrapper<com.agent.mvp.knowledge.entity.KnowledgeItem>()
                        .eq(com.agent.mvp.knowledge.entity.KnowledgeItem::getUserId, userId);
        if (status != null) {
            wrapper.eq(com.agent.mvp.knowledge.entity.KnowledgeItem::getStatus, status);
        }
        return knowledgeItemRepository.selectCount(wrapper);
    }

    private SettingsProfileResponse toResponse(User user, UserProfile profile) {
        return new SettingsProfileResponse(
                profile.getUserId(),
                user.getEmail(),
                profile.getDisplayName(),
                profile.getAvatarUrl(),
                profile.getOrganizeMode(),
                profile.getPrivacyMode(),
                profile.getDefaultModelSourceId(),
                profile.getSummaryModelSourceId(),
                profile.getTaggingModelSourceId(),
                profile.getCreatedAt(),
                profile.getUpdatedAt());
    }
}
