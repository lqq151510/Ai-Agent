package com.agent.mvp.settings.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.agent.mvp.auth.entity.User;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.knowledge.entity.KnowledgeItemTag;
import com.agent.mvp.knowledge.entity.KnowledgeSourceAsset;
import com.agent.mvp.knowledge.entity.KnowledgeTag;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagView;
import com.agent.mvp.knowledge.repo.KnowledgeSourceAssetRepository;
import com.agent.mvp.knowledge.repo.KnowledgeTagRepository;
import com.agent.mvp.knowledge.review.KnowledgeReviewState;
import com.agent.mvp.knowledge.review.KnowledgeReviewStateRepository;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.repo.ModelSourceRepository;
import com.agent.mvp.settings.dto.SettingsBackupKnowledgeItem;
import com.agent.mvp.settings.dto.SettingsBackupPayload;
import com.agent.mvp.settings.dto.SettingsBackupPreferences;
import com.agent.mvp.settings.dto.SettingsBackupReviewState;
import com.agent.mvp.settings.dto.SettingsBackupSourceAsset;
import com.agent.mvp.settings.dto.SettingsBackupTag;
import com.agent.mvp.settings.dto.UpdateSettingsProfileRequest;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.repo.UserProfileRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class SettingsServiceTest {

    private static final Instant IMPORT_TIME = Instant.parse("2026-07-29T08:00:00Z");
    private static final UUID IMPORT_ITEM_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID SECOND_IMPORT_ITEM_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000102");
    private static final UUID IMPORT_TAG_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000201");
    private static final UUID SECOND_IMPORT_TAG_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000202");

    @Test
    void updateProfileShouldRejectForeignModelSource() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository);

        UUID userId = UUID.randomUUID();
        UUID foreignUserId = UUID.randomUUID();
        UUID modelSourceId = UUID.randomUUID();
        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(userProfileService.getOrCreate(userId))
                .thenReturn(UserProfile.builder().userId(userId).build());
        when(modelSourceRepository.selectById(modelSourceId))
                .thenReturn(ModelSource.builder().id(modelSourceId).userId(foreignUserId).build());

        assertThrows(
                BadRequestException.class,
                () ->
                        service.updateProfile(
                                userId,
                                new UpdateSettingsProfileRequest(
                                        "name",
                                        null,
                                        "manual",
                                        "local_first",
                                        modelSourceId,
                                        null,
                                        null,
                                        null,
                                        null,
                                        null)));
    }

    @Test
    void updateProfileShouldSyncDefaultModelSourceState() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository);

        UUID userId = UUID.randomUUID();
        UUID oldDefaultId = UUID.randomUUID();
        UUID newDefaultId = UUID.randomUUID();
        UserProfile profile =
                UserProfile.builder().userId(userId).defaultModelSourceId(oldDefaultId).build();
        ModelSource oldDefault =
                ModelSource.builder()
                        .id(oldDefaultId)
                        .userId(userId)
                        .name("old")
                        .providerType("openai")
                        .baseUrl("http://old")
                        .apiKey("sk-old")
                        .defaultModel("old-model")
                        .enabled(true)
                        .isDefault(true)
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();
        ModelSource newDefault =
                ModelSource.builder()
                        .id(newDefaultId)
                        .userId(userId)
                        .name("new")
                        .providerType("openai")
                        .baseUrl("http://new")
                        .apiKey("sk-new")
                        .defaultModel("new-model")
                        .enabled(true)
                        .isDefault(false)
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();

        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(userProfileService.getOrCreate(userId)).thenReturn(profile);
        when(modelSourceRepository.selectById(newDefaultId)).thenReturn(newDefault);
        when(modelSourceRepository.selectList(org.mockito.ArgumentMatchers.any()))
                .thenReturn(List.of(oldDefault, newDefault));

        var response =
                service.updateProfile(
                        userId,
                        new UpdateSettingsProfileRequest(
                                null,
                                null,
                                null,
                                null,
                                newDefaultId,
                                null,
                                null,
                                null,
                                null,
                                null));

        assertEquals(newDefaultId, profile.getDefaultModelSourceId());
        assertEquals(newDefaultId, response.defaultModelSourceId());
        verify(modelSourceRepository).syncDefault(eq(userId), eq(newDefaultId), any(Instant.class));
        verify(userProfileService).save(profile);
    }

    @Test
    void updateProfileShouldClearModelSourceBindings() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository);

        UUID userId = UUID.randomUUID();
        UUID defaultId = UUID.randomUUID();
        UUID summaryId = UUID.randomUUID();
        UUID taggingId = UUID.randomUUID();
        UserProfile profile =
                UserProfile.builder()
                        .userId(userId)
                        .defaultModelSourceId(defaultId)
                        .summaryModelSourceId(summaryId)
                        .taggingModelSourceId(taggingId)
                        .build();
        ModelSource currentDefault =
                ModelSource.builder()
                        .id(defaultId)
                        .userId(userId)
                        .name("default")
                        .providerType("openai")
                        .baseUrl("http://default")
                        .apiKey("sk-default")
                        .defaultModel("default-model")
                        .enabled(true)
                        .isDefault(true)
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();

        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(userProfileService.getOrCreate(userId)).thenReturn(profile);
        when(modelSourceRepository.selectList(org.mockito.ArgumentMatchers.any()))
                .thenReturn(List.of(currentDefault));

        var response =
                service.updateProfile(
                        userId,
                        new UpdateSettingsProfileRequest(
                                null, null, null, null, null, null, null, true, true, true));

        assertNull(profile.getDefaultModelSourceId());
        assertNull(profile.getSummaryModelSourceId());
        assertNull(profile.getTaggingModelSourceId());
        assertNull(response.defaultModelSourceId());
        verify(modelSourceRepository).clearDefaultByUserId(eq(userId), any(Instant.class));
        verify(userProfileService).save(profile);
    }

    @Test
    void exportBackupShouldIncludeKnowledgeAndTagsWithoutModelSecrets() throws Exception {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeSourceAssetRepository knowledgeSourceAssetRepository =
                mock(KnowledgeSourceAssetRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeSourceAssetRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository);

        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        UUID tagId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-07-29T08:00:00Z");
        UserProfile profile =
                UserProfile.builder()
                        .userId(userId)
                        .displayName("泽宝")
                        .avatarUrl("https://example.com/avatar.png")
                        .organizeMode("manual")
                        .privacyMode("local_first")
                        .build();
        KnowledgeItem item =
                KnowledgeItem.builder()
                        .id(itemId)
                        .userId(userId)
                        .sourceType("markdown")
                        .title("RAG notes")
                        .sourceUri("file:///notes/rag.md")
                        .rawContent("RAG content")
                        .cleanedContent("RAG content")
                        .summary("RAG summary")
                        .status("ready")
                        .language("en")
                        .wordCount(2)
                        .createdAt(createdAt)
                        .updatedAt(createdAt)
                        .build();
        KnowledgeTag tag =
                KnowledgeTag.builder()
                        .id(tagId)
                        .userId(userId)
                        .name("rag")
                        .color("#7a8a84")
                        .createdAt(createdAt)
                        .build();
        KnowledgeSourceAsset sourceAsset =
                KnowledgeSourceAsset.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .knowledgeItemId(itemId)
                        .contentHash("f".repeat(64))
                        .originalFilename("/Users/ze/private/rag.md")
                        .mediaType("text/markdown")
                        .byteSize(42L)
                        .origin("picker")
                        .availability("available")
                        .createdAt(createdAt)
                        .updatedAt(createdAt)
                        .build();
        KnowledgeItemTagView relation = new KnowledgeItemTagView();
        relation.setKnowledgeItemId(itemId);
        relation.setTagId(tagId);
        relation.setName("rag");
        relation.setColor("#7a8a84");
        relation.setCreatedAt(createdAt);

        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(userProfileRepository.selectById(userId)).thenReturn(profile);
        when(knowledgeTagRepository.selectList(any())).thenReturn(List.of(tag));
        when(knowledgeItemRepository.selectList(any())).thenReturn(List.of(item));
        when(knowledgeSourceAssetRepository.selectList(any())).thenReturn(List.of(sourceAsset));
        when(knowledgeItemTagRepository.findTagsByKnowledgeItemIds(List.of(itemId)))
                .thenReturn(List.of(relation));
        when(modelSourceRepository.selectList(any()))
                .thenReturn(
                        List.of(
                                ModelSource.builder()
                                        .apiKey("sk-local-secret")
                                        .defaultModel("private-model")
                                        .build()));

        SettingsBackupPayload backup = service.exportBackup(userId);

        assertEquals(1, backup.schemaVersion());
        assertFalse(backup.modelSourcesIncluded());
        assertEquals("泽宝", backup.preferences().displayName());
        assertEquals(List.of(tagId), backup.knowledgeItems().getFirst().tagIds());
        assertEquals("upload://rag.md", backup.knowledgeItems().getFirst().sourceUri());
        assertEquals(sourceAsset.getId(), backup.knowledgeItems().getFirst().sourceAsset().id());
        assertEquals("rag.md", backup.knowledgeItems().getFirst().sourceAsset().originalFilename());
        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(backup);
        assertFalse(json.contains("apiKey"));
        assertFalse(json.contains("sk-local-secret"));
        assertFalse(json.contains(sourceAsset.getContentHash()));
        assertFalse(json.contains("contentHash"));
        assertFalse(json.contains("/Users/ze/private"));
        verifyNoInteractions(modelSourceRepository);
        verify(userProfileService, never()).getOrCreate(any());
    }

    @Test
    void importBackupShouldCreateNewItemsAndMergeTags() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository);

        UUID userId = UUID.randomUUID();
        UUID sourceItemId = UUID.randomUUID();
        UUID javaBackupTagId = UUID.randomUUID();
        UUID ragBackupTagId = UUID.randomUUID();
        UUID existingJavaTagId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-07-29T08:00:00Z");
        KnowledgeTag existingJavaTag =
                KnowledgeTag.builder()
                        .id(existingJavaTagId)
                        .userId(userId)
                        .name("java")
                        .color("#111111")
                        .createdAt(createdAt)
                        .build();
        SettingsBackupPayload backup =
                validBackup(
                        sourceItemId,
                        List.of(
                                new SettingsBackupTag(
                                        javaBackupTagId, "java", "#222222", createdAt),
                                new SettingsBackupTag(ragBackupTagId, "rag", "#7a8a84", createdAt)),
                        List.of(javaBackupTagId, ragBackupTagId),
                        "ready",
                        "markdown");

        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(knowledgeTagRepository.selectList(any())).thenReturn(List.of(existingJavaTag));

        var response = service.importBackup(userId, backup);

        assertEquals(1, response.importedItems());
        assertEquals(1, response.createdTags());
        assertFalse(response.preferencesRestored());
        assertFalse(response.modelSourcesRestored());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<KnowledgeItem>> itemCaptor = ArgumentCaptor.forClass(List.class);
        verify(knowledgeItemRepository).insertBatch(itemCaptor.capture());
        KnowledgeItem importedItem = itemCaptor.getValue().get(0);
        assertNotEquals(sourceItemId, importedItem.getId());
        assertEquals(userId, importedItem.getUserId());
        assertEquals("ready", importedItem.getStatus());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<KnowledgeTag>> tagCaptor = ArgumentCaptor.forClass(List.class);
        verify(knowledgeTagRepository).insertBatch(tagCaptor.capture());
        KnowledgeTag createdRagTag = tagCaptor.getValue().get(0);
        assertEquals("rag", createdRagTag.getName());
        assertEquals(userId, createdRagTag.getUserId());
        assertTrue(createdRagTag.getId() != null);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<KnowledgeItemTag>> relationCaptor = ArgumentCaptor.forClass(List.class);
        verify(knowledgeItemTagRepository).insertBatch(relationCaptor.capture());
        assertEquals(2, relationCaptor.getValue().size());
        assertTrue(
                relationCaptor.getValue().stream()
                        .allMatch(
                                relation ->
                                        importedItem
                                                .getId()
                                                .equals(relation.getKnowledgeItemId())));
        assertTrue(
                relationCaptor.getValue().stream()
                        .anyMatch(relation -> existingJavaTagId.equals(relation.getTagId())));
        assertTrue(
                relationCaptor.getValue().stream()
                        .anyMatch(relation -> createdRagTag.getId().equals(relation.getTagId())));
        verify(knowledgeItemRepository, never()).updateById(any(KnowledgeItem.class));
        verify(userProfileService, never()).save(any());
    }

    @Test
    void importBackupShouldRestoreSafeSourceMetadataAsMissingWithoutHashOrLocalPath() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeSourceAssetRepository knowledgeSourceAssetRepository =
                mock(KnowledgeSourceAssetRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeSourceAssetRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository);

        UUID userId = UUID.randomUUID();
        UUID backupItemId = UUID.randomUUID();
        UUID backupTagId = UUID.randomUUID();
        UUID backupSourceAssetId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-07-29T08:00:00Z");
        SettingsBackupPayload backup =
                new SettingsBackupPayload(
                        1,
                        createdAt,
                        new SettingsBackupPreferences("泽宝", null, "manual", "local_first"),
                        List.of(new SettingsBackupTag(backupTagId, "rag", "#7a8a84", createdAt)),
                        List.of(
                                new SettingsBackupKnowledgeItem(
                                        backupItemId,
                                        "markdown",
                                        "Imported note",
                                        "file:///Users/ze/private/notes.md",
                                        "Imported content",
                                        null,
                                        null,
                                        "inbox",
                                        "en",
                                        2,
                                        createdAt,
                                        createdAt,
                                        null,
                                        new SettingsBackupSourceAsset(
                                                backupSourceAssetId,
                                                "C:\\Users\\ze\\private\\notes.md",
                                                "text/markdown",
                                                42L,
                                                "watched_folder",
                                                "available"),
                                        List.of(backupTagId))),
                        false);
        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(knowledgeTagRepository.selectList(any())).thenReturn(List.of());

        service.importBackup(userId, backup);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<KnowledgeItem>> itemCaptor = ArgumentCaptor.forClass(List.class);
        verify(knowledgeItemRepository).insertBatch(itemCaptor.capture());
        assertEquals("upload://notes.md", itemCaptor.getValue().get(0).getSourceUri());
        ArgumentCaptor<KnowledgeSourceAsset> assetCaptor =
                ArgumentCaptor.forClass(KnowledgeSourceAsset.class);
        verify(knowledgeSourceAssetRepository).insert(assetCaptor.capture());
        KnowledgeSourceAsset restoredAsset = assetCaptor.getValue();
        assertNotEquals(backupSourceAssetId, restoredAsset.getId());
        assertEquals(itemCaptor.getValue().get(0).getId(), restoredAsset.getKnowledgeItemId());
        assertNull(restoredAsset.getContentHash());
        assertEquals("notes.md", restoredAsset.getOriginalFilename());
        assertEquals("text/markdown", restoredAsset.getMediaType());
        assertEquals(42L, restoredAsset.getByteSize());
        assertEquals("watched_folder", restoredAsset.getOrigin());
        assertEquals("missing", restoredAsset.getAvailability());
    }

    @Test
    void importBackupShouldRejectInvalidPayloadBeforeWriting() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository);

        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        UUID tagId = UUID.randomUUID();
        SettingsBackupPayload invalidBackup =
                validBackup(
                        itemId,
                        List.of(new SettingsBackupTag(tagId, "rag", "#7a8a84", Instant.now())),
                        List.of(tagId),
                        "invalid",
                        "markdown");
        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());

        assertThrows(BadRequestException.class, () -> service.importBackup(userId, invalidBackup));

        verifyNoInteractions(
                modelSourceRepository,
                knowledgeItemRepository,
                knowledgeTagRepository,
                knowledgeItemTagRepository);
    }

    @Test
    void importBackupShouldValidateEveryItemBeforeAnyWrite() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository);

        UUID userId = UUID.randomUUID();
        UUID tagId = UUID.randomUUID();
        SettingsBackupPayload firstValidItem =
                validBackup(
                        UUID.randomUUID(),
                        List.of(new SettingsBackupTag(tagId, "rag", "#7a8a84", Instant.now())),
                        List.of(tagId),
                        "ready",
                        "markdown");
        SettingsBackupKnowledgeItem laterInvalidItem =
                new SettingsBackupKnowledgeItem(
                        UUID.randomUUID(),
                        "unsupported",
                        "Later invalid item",
                        null,
                        "This invalid item must prevent every write.",
                        null,
                        null,
                        "ready",
                        "en",
                        1,
                        firstValidItem.exportedAt(),
                        firstValidItem.exportedAt(),
                        null,
                        null,
                        List.of(tagId));
        SettingsBackupPayload backup =
                new SettingsBackupPayload(
                        firstValidItem.schemaVersion(),
                        firstValidItem.exportedAt(),
                        firstValidItem.preferences(),
                        firstValidItem.tags(),
                        List.of(firstValidItem.knowledgeItems().getFirst(), laterInvalidItem),
                        firstValidItem.modelSourcesIncluded());
        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());

        assertThrows(BadRequestException.class, () -> service.importBackup(userId, backup));

        verifyNoInteractions(
                modelSourceRepository,
                knowledgeItemRepository,
                knowledgeTagRepository,
                knowledgeItemTagRepository);
    }

    @Test
    void exportBackupShouldIncludeOwnedReviewStateWithoutNewSensitiveFields() throws Exception {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeSourceAssetRepository knowledgeSourceAssetRepository =
                mock(KnowledgeSourceAssetRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        KnowledgeReviewStateRepository reviewStateRepository =
                mock(KnowledgeReviewStateRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeSourceAssetRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository,
                        reviewStateRepository);

        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        Instant now = Instant.parse("2026-08-06T12:00:00Z");
        KnowledgeItem item =
                KnowledgeItem.builder()
                        .id(itemId)
                        .userId(userId)
                        .sourceType("markdown")
                        .title("RAG notes")
                        .rawContent("private body")
                        .status("ready")
                        .wordCount(1)
                        .createdAt(now)
                        .updatedAt(now)
                        .build();
        KnowledgeReviewState state =
                KnowledgeReviewState.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .knowledgeItemId(itemId)
                        .dueAt(now.plusSeconds(86_400))
                        .intervalDays(1)
                        .easeFactor(2.5)
                        .repetitions(1)
                        .lastRating("good")
                        .lastReviewedAt(now)
                        .createdAt(now)
                        .updatedAt(now)
                        .build();
        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(knowledgeTagRepository.selectList(any())).thenReturn(List.of());
        when(knowledgeItemRepository.selectList(any())).thenReturn(List.of(item));
        when(knowledgeSourceAssetRepository.selectList(any())).thenReturn(List.of());
        when(knowledgeItemTagRepository.findTagsByKnowledgeItemIds(List.of(itemId)))
                .thenReturn(List.of());
        when(reviewStateRepository.selectList(any())).thenReturn(List.of(state));

        SettingsBackupPayload backup = service.exportBackup(userId);

        assertEquals(1, backup.reviewStates().size());
        SettingsBackupReviewState exportedState = backup.reviewStates().getFirst();
        assertEquals(itemId, exportedState.knowledgeItemId());
        assertEquals("good", exportedState.lastRating());
        String reviewJson =
                new ObjectMapper().findAndRegisterModules().writeValueAsString(exportedState);
        assertFalse(reviewJson.contains("rawContent"));
        assertFalse(reviewJson.contains("sourceUri"));
        assertFalse(reviewJson.contains("contentHash"));
    }

    @Test
    void importBackupMapsReviewStateToNewlyCreatedKnowledgeItem() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeSourceAssetRepository knowledgeSourceAssetRepository =
                mock(KnowledgeSourceAssetRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        KnowledgeReviewStateRepository reviewStateRepository =
                mock(KnowledgeReviewStateRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeSourceAssetRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository,
                        reviewStateRepository);

        UUID userId = UUID.randomUUID();
        UUID backupItemId = UUID.randomUUID();
        UUID backupTagId = UUID.randomUUID();
        Instant now = Instant.parse("2026-08-06T12:00:00Z");
        SettingsBackupPayload legacyShape =
                validBackup(
                        backupItemId,
                        List.of(new SettingsBackupTag(backupTagId, "rag", "#7a8a84", now)),
                        List.of(backupTagId),
                        "ready",
                        "markdown");
        SettingsBackupPayload backup =
                new SettingsBackupPayload(
                        legacyShape.schemaVersion(),
                        legacyShape.exportedAt(),
                        legacyShape.preferences(),
                        legacyShape.tags(),
                        legacyShape.knowledgeItems(),
                        legacyShape.modelSourcesIncluded(),
                        List.of(
                                new SettingsBackupReviewState(
                                        backupItemId,
                                        now.plusSeconds(86_400),
                                        1,
                                        2.5,
                                        1,
                                        "good",
                                        now,
                                        now,
                                        now)));
        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(knowledgeTagRepository.selectList(any())).thenReturn(List.of());

        service.importBackup(userId, backup);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<KnowledgeItem>> itemCaptor = ArgumentCaptor.forClass(List.class);
        verify(knowledgeItemRepository).insertBatch(itemCaptor.capture());
        KnowledgeItem importedItem = itemCaptor.getValue().getFirst();
        ArgumentCaptor<KnowledgeReviewState> stateCaptor =
                ArgumentCaptor.forClass(KnowledgeReviewState.class);
        verify(reviewStateRepository).insert(stateCaptor.capture());
        KnowledgeReviewState restoredState = stateCaptor.getValue();
        assertNotEquals(backupItemId, importedItem.getId());
        assertEquals(importedItem.getId(), restoredState.getKnowledgeItemId());
        assertEquals(userId, restoredState.getUserId());
        assertEquals("good", restoredState.getLastRating());
        assertEquals(now.plusSeconds(86_400), restoredState.getDueAt());
    }

    @Test
    void schemaVersionOneBackupWithoutReviewStatesStillImports() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository);
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        UUID tagId = UUID.randomUUID();
        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        when(knowledgeTagRepository.selectList(any())).thenReturn(List.of());

        assertDoesNotThrow(
                () ->
                        service.importBackup(
                                userId,
                                validBackup(
                                        itemId,
                                        List.of(
                                                new SettingsBackupTag(
                                                        tagId,
                                                        "rag",
                                                        "#7a8a84",
                                                        Instant.parse("2026-08-06T12:00:00Z"))),
                                        List.of(tagId),
                                        "ready",
                                        "markdown")));
    }

    @Test
    void importBackupShouldRejectMalformedEnvelopeAndDuplicateIdentities() {
        SettingsBackupTag validTag = validImportTag(IMPORT_TAG_ID, "rag");
        SettingsBackupKnowledgeItem validItem = validImportItem(IMPORT_ITEM_ID);
        List<InvalidBackupCase> cases =
                List.of(
                        new InvalidBackupCase("null payload", null),
                        new InvalidBackupCase(
                                "unsupported schema",
                                importBackup(
                                        2,
                                        IMPORT_TIME,
                                        validImportPreferences(),
                                        List.of(validTag),
                                        List.of(validItem),
                                        false,
                                        List.of())),
                        new InvalidBackupCase(
                                "missing export time",
                                importBackup(
                                        1,
                                        null,
                                        validImportPreferences(),
                                        List.of(validTag),
                                        List.of(validItem),
                                        false,
                                        List.of())),
                        new InvalidBackupCase(
                                "model sources included",
                                importBackup(
                                        1,
                                        IMPORT_TIME,
                                        validImportPreferences(),
                                        List.of(validTag),
                                        List.of(validItem),
                                        true,
                                        List.of())),
                        new InvalidBackupCase(
                                "missing preferences",
                                importBackup(
                                        1,
                                        IMPORT_TIME,
                                        null,
                                        List.of(validTag),
                                        List.of(validItem),
                                        false,
                                        List.of())),
                        new InvalidBackupCase(
                                "missing tags",
                                importBackup(
                                        1,
                                        IMPORT_TIME,
                                        validImportPreferences(),
                                        null,
                                        List.of(validItem),
                                        false,
                                        List.of())),
                        new InvalidBackupCase(
                                "missing items",
                                importBackup(
                                        1,
                                        IMPORT_TIME,
                                        validImportPreferences(),
                                        List.of(validTag),
                                        null,
                                        false,
                                        List.of())),
                        new InvalidBackupCase(
                                "duplicate tag id",
                                importBackup(
                                        List.of(validTag, validImportTag(IMPORT_TAG_ID, "java")),
                                        List.of(validItem),
                                        List.of())),
                        new InvalidBackupCase(
                                "duplicate normalized tag name",
                                importBackup(
                                        List.of(
                                                validTag,
                                                validImportTag(SECOND_IMPORT_TAG_ID, " RAG ")),
                                        List.of(validItem),
                                        List.of())),
                        new InvalidBackupCase(
                                "duplicate item id",
                                importBackup(
                                        List.of(validTag),
                                        List.of(validItem, validImportItem(IMPORT_ITEM_ID)),
                                        List.of())),
                        new InvalidBackupCase(
                                "null tag",
                                importBackup(
                                        Collections.singletonList(null),
                                        List.of(validItem),
                                        List.of())),
                        new InvalidBackupCase(
                                "missing tag id",
                                importBackup(
                                        List.of(validImportTag(null, "rag")),
                                        List.of(validItem),
                                        List.of())),
                        new InvalidBackupCase(
                                "missing tag creation time",
                                importBackup(
                                        List.of(
                                                new SettingsBackupTag(
                                                        IMPORT_TAG_ID, "rag", "#7a8a84", null)),
                                        List.of(validItem),
                                        List.of())));

        cases.forEach(this::assertImportRejectedBeforeWriting);
    }

    @Test
    void importBackupShouldRejectInvalidItemsAndSourceAssetMetadata() {
        SettingsBackupTag validTag = validImportTag(IMPORT_TAG_ID, "rag");
        List<InvalidBackupCase> cases =
                List.of(
                        new InvalidBackupCase(
                                "null item",
                                importBackup(
                                        List.of(validTag),
                                        Collections.singletonList(null),
                                        List.of())),
                        new InvalidBackupCase(
                                "missing item id",
                                importBackup(
                                        List.of(validTag),
                                        List.of(
                                                importItem(
                                                        null,
                                                        "ready",
                                                        2,
                                                        IMPORT_TIME,
                                                        IMPORT_TIME,
                                                        null,
                                                        null,
                                                        List.of(IMPORT_TAG_ID))),
                                        List.of())),
                        invalidItemCase(
                                "null word count",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        null,
                                        IMPORT_TIME,
                                        IMPORT_TIME,
                                        null,
                                        null,
                                        List.of(IMPORT_TAG_ID))),
                        invalidItemCase(
                                "negative word count",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        -1,
                                        IMPORT_TIME,
                                        IMPORT_TIME,
                                        null,
                                        null,
                                        List.of(IMPORT_TAG_ID))),
                        invalidItemCase(
                                "missing createdAt",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        2,
                                        null,
                                        IMPORT_TIME,
                                        null,
                                        null,
                                        List.of(IMPORT_TAG_ID))),
                        invalidItemCase(
                                "missing updatedAt",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        2,
                                        IMPORT_TIME,
                                        null,
                                        null,
                                        null,
                                        List.of(IMPORT_TAG_ID))),
                        invalidItemCase(
                                "updatedAt before createdAt",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        2,
                                        IMPORT_TIME,
                                        IMPORT_TIME.minusSeconds(1),
                                        null,
                                        null,
                                        List.of(IMPORT_TAG_ID))),
                        invalidItemCase(
                                "archived item missing archivedAt",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "archived",
                                        2,
                                        IMPORT_TIME,
                                        IMPORT_TIME,
                                        null,
                                        null,
                                        List.of(IMPORT_TAG_ID))),
                        invalidItemCase(
                                "ready item with archivedAt",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        2,
                                        IMPORT_TIME,
                                        IMPORT_TIME,
                                        IMPORT_TIME,
                                        null,
                                        List.of(IMPORT_TAG_ID))),
                        invalidItemCase(
                                "too many tags",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        2,
                                        IMPORT_TIME,
                                        IMPORT_TIME,
                                        null,
                                        null,
                                        Collections.nCopies(26, IMPORT_TAG_ID))),
                        invalidItemCase(
                                "null tag reference",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        2,
                                        IMPORT_TIME,
                                        IMPORT_TIME,
                                        null,
                                        null,
                                        Collections.singletonList(null))),
                        invalidItemCase(
                                "unknown tag reference",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        2,
                                        IMPORT_TIME,
                                        IMPORT_TIME,
                                        null,
                                        null,
                                        List.of(SECOND_IMPORT_TAG_ID))),
                        invalidItemCase(
                                "duplicate tag reference",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        2,
                                        IMPORT_TIME,
                                        IMPORT_TIME,
                                        null,
                                        null,
                                        List.of(IMPORT_TAG_ID, IMPORT_TAG_ID))),
                        invalidItemCase(
                                "source asset missing id",
                                importItem(
                                        IMPORT_ITEM_ID,
                                        "ready",
                                        2,
                                        IMPORT_TIME,
                                        IMPORT_TIME,
                                        null,
                                        new SettingsBackupSourceAsset(
                                                null,
                                                "notes.md",
                                                "text/markdown",
                                                42L,
                                                "picker",
                                                "available"),
                                        List.of(IMPORT_TAG_ID))),
                        invalidSourceAssetCase(
                                "source asset missing size", validImportSourceAsset(null)),
                        invalidSourceAssetCase(
                                "source asset negative size", validImportSourceAsset(-1L)),
                        invalidSourceAssetCase(
                                "source asset over size limit",
                                validImportSourceAsset(20L * 1024 * 1024 + 1)));

        cases.forEach(this::assertImportRejectedBeforeWriting);
    }

    @Test
    void importBackupShouldRejectInvalidOrDuplicateReviewStates() {
        SettingsBackupTag validTag = validImportTag(IMPORT_TAG_ID, "rag");
        SettingsBackupKnowledgeItem readyItem = validImportItem(IMPORT_ITEM_ID);
        SettingsBackupReviewState validReview = validImportReviewState(IMPORT_ITEM_ID);
        List<InvalidBackupCase> cases =
                List.of(
                        new InvalidBackupCase(
                                "null review state",
                                importBackup(
                                        List.of(validTag),
                                        List.of(readyItem),
                                        Collections.singletonList(null))),
                        new InvalidBackupCase(
                                "review state missing item id",
                                importBackup(
                                        List.of(validTag),
                                        List.of(readyItem),
                                        List.of(validImportReviewState(null)))),
                        new InvalidBackupCase(
                                "review state references unknown item",
                                importBackup(
                                        List.of(validTag),
                                        List.of(readyItem),
                                        List.of(validImportReviewState(SECOND_IMPORT_ITEM_ID)))),
                        new InvalidBackupCase(
                                "review state references inbox item",
                                importBackup(
                                        List.of(validTag),
                                        List.of(
                                                importItem(
                                                        IMPORT_ITEM_ID,
                                                        "inbox",
                                                        2,
                                                        IMPORT_TIME,
                                                        IMPORT_TIME,
                                                        null,
                                                        null,
                                                        List.of(IMPORT_TAG_ID))),
                                        List.of(validReview))),
                        new InvalidBackupCase(
                                "archived review continues to field validation",
                                importBackup(
                                        List.of(validTag),
                                        List.of(
                                                importItem(
                                                        IMPORT_ITEM_ID,
                                                        "archived",
                                                        2,
                                                        IMPORT_TIME,
                                                        IMPORT_TIME,
                                                        IMPORT_TIME,
                                                        null,
                                                        List.of(IMPORT_TAG_ID))),
                                        List.of(
                                                reviewState(
                                                        IMPORT_ITEM_ID,
                                                        null,
                                                        1,
                                                        2.5,
                                                        1,
                                                        IMPORT_TIME,
                                                        IMPORT_TIME,
                                                        IMPORT_TIME)))),
                        new InvalidBackupCase(
                                "duplicate review states",
                                importBackup(
                                        List.of(validTag),
                                        List.of(readyItem, validImportItem(SECOND_IMPORT_ITEM_ID)),
                                        List.of(validReview, validReview))));

        cases.forEach(this::assertImportRejectedBeforeWriting);
    }

    @Test
    void importBackupShouldAcceptEmptyPortableCollectionsWithoutBatchWrites() {
        ImportFixture fixture = importFixture();
        SettingsBackupPayload emptyBackup = importBackup(List.of(), List.of(), List.of());

        var response = fixture.service().importBackup(fixture.userId(), emptyBackup);

        assertEquals(0, response.importedItems());
        assertEquals(0, response.createdTags());
        verify(fixture.knowledgeTagRepository()).selectList(any());
        verify(fixture.knowledgeTagRepository(), never()).insertBatch(any());
        verify(fixture.knowledgeItemRepository(), never()).insertBatch(any());
        verify(fixture.knowledgeItemTagRepository(), never()).insertBatch(any());
        verifyNoInteractions(
                fixture.knowledgeSourceAssetRepository(), fixture.reviewStateRepository());
    }

    private SettingsBackupPayload validBackup(
            UUID itemId,
            List<SettingsBackupTag> tags,
            List<UUID> tagIds,
            String status,
            String sourceType) {
        Instant createdAt = Instant.parse("2026-07-29T08:00:00Z");
        return new SettingsBackupPayload(
                1,
                createdAt,
                new SettingsBackupPreferences("泽宝", null, "manual", "local_first"),
                tags,
                List.of(
                        new SettingsBackupKnowledgeItem(
                                itemId,
                                sourceType,
                                "Imported note",
                                null,
                                "Imported content",
                                "Imported content",
                                "Imported summary",
                                status,
                                "en",
                                2,
                                createdAt,
                                createdAt,
                                null,
                                null,
                                tagIds)),
                false);
    }

    private void assertImportRejectedBeforeWriting(InvalidBackupCase invalidCase) {
        ImportFixture fixture = importFixture();

        assertThrows(
                BadRequestException.class,
                () -> fixture.service().importBackup(fixture.userId(), invalidCase.backup()),
                invalidCase.name());

        verifyNoInteractions(
                fixture.userProfileRepository(),
                fixture.modelSourceRepository(),
                fixture.knowledgeItemRepository(),
                fixture.knowledgeSourceAssetRepository(),
                fixture.knowledgeTagRepository(),
                fixture.knowledgeItemTagRepository(),
                fixture.reviewStateRepository());
    }

    private InvalidBackupCase invalidItemCase(
            String name, SettingsBackupKnowledgeItem invalidItem) {
        return new InvalidBackupCase(
                name,
                importBackup(
                        List.of(validImportTag(IMPORT_TAG_ID, "rag")),
                        List.of(invalidItem),
                        List.of()));
    }

    private InvalidBackupCase invalidSourceAssetCase(
            String name, SettingsBackupSourceAsset sourceAsset) {
        return invalidItemCase(
                name,
                importItem(
                        IMPORT_ITEM_ID,
                        "ready",
                        2,
                        IMPORT_TIME,
                        IMPORT_TIME,
                        null,
                        sourceAsset,
                        List.of(IMPORT_TAG_ID)));
    }

    private ImportFixture importFixture() {
        UserProfileService userProfileService = mock(UserProfileService.class);
        UserProfileRepository userProfileRepository = mock(UserProfileRepository.class);
        ModelSourceRepository modelSourceRepository = mock(ModelSourceRepository.class);
        KnowledgeItemRepository knowledgeItemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeSourceAssetRepository knowledgeSourceAssetRepository =
                mock(KnowledgeSourceAssetRepository.class);
        KnowledgeTagRepository knowledgeTagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository knowledgeItemTagRepository =
                mock(KnowledgeItemTagRepository.class);
        KnowledgeReviewStateRepository reviewStateRepository =
                mock(KnowledgeReviewStateRepository.class);
        SettingsService service =
                new SettingsService(
                        userProfileService,
                        userProfileRepository,
                        modelSourceRepository,
                        knowledgeItemRepository,
                        knowledgeSourceAssetRepository,
                        knowledgeTagRepository,
                        knowledgeItemTagRepository,
                        reviewStateRepository);
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("user@example.com").build());
        return new ImportFixture(
                service,
                userId,
                userProfileRepository,
                modelSourceRepository,
                knowledgeItemRepository,
                knowledgeSourceAssetRepository,
                knowledgeTagRepository,
                knowledgeItemTagRepository,
                reviewStateRepository);
    }

    private SettingsBackupPayload importBackup(
            List<SettingsBackupTag> tags,
            List<SettingsBackupKnowledgeItem> items,
            List<SettingsBackupReviewState> reviewStates) {
        return importBackup(
                1, IMPORT_TIME, validImportPreferences(), tags, items, false, reviewStates);
    }

    private SettingsBackupPayload importBackup(
            Integer schemaVersion,
            Instant exportedAt,
            SettingsBackupPreferences preferences,
            List<SettingsBackupTag> tags,
            List<SettingsBackupKnowledgeItem> items,
            Boolean modelSourcesIncluded,
            List<SettingsBackupReviewState> reviewStates) {
        return new SettingsBackupPayload(
                schemaVersion,
                exportedAt,
                preferences,
                tags,
                items,
                modelSourcesIncluded,
                reviewStates);
    }

    private SettingsBackupPreferences validImportPreferences() {
        return new SettingsBackupPreferences("泽宝", null, "manual", "local_first");
    }

    private SettingsBackupTag validImportTag(UUID id, String name) {
        return new SettingsBackupTag(id, name, "#7a8a84", IMPORT_TIME);
    }

    private SettingsBackupKnowledgeItem validImportItem(UUID id) {
        return importItem(
                id, "ready", 2, IMPORT_TIME, IMPORT_TIME, null, null, List.of(IMPORT_TAG_ID));
    }

    private SettingsBackupKnowledgeItem importItem(
            UUID id,
            String status,
            Integer wordCount,
            Instant createdAt,
            Instant updatedAt,
            Instant archivedAt,
            SettingsBackupSourceAsset sourceAsset,
            List<UUID> tagIds) {
        return new SettingsBackupKnowledgeItem(
                id,
                "markdown",
                "Imported note",
                null,
                "Imported content",
                "Imported content",
                "Imported summary",
                status,
                "en",
                wordCount,
                createdAt,
                updatedAt,
                archivedAt,
                sourceAsset,
                tagIds);
    }

    private SettingsBackupSourceAsset validImportSourceAsset(Long byteSize) {
        return new SettingsBackupSourceAsset(
                UUID.fromString("00000000-0000-0000-0000-000000000301"),
                "notes.md",
                "text/markdown",
                byteSize,
                "picker",
                "available");
    }

    private SettingsBackupReviewState validImportReviewState(UUID itemId) {
        return reviewState(
                itemId,
                IMPORT_TIME.plusSeconds(86_400),
                1,
                2.5,
                1,
                IMPORT_TIME,
                IMPORT_TIME,
                IMPORT_TIME);
    }

    private SettingsBackupReviewState reviewState(
            UUID itemId,
            Instant dueAt,
            Integer intervalDays,
            Double easeFactor,
            Integer repetitions,
            Instant lastReviewedAt,
            Instant createdAt,
            Instant updatedAt) {
        return new SettingsBackupReviewState(
                itemId,
                dueAt,
                intervalDays,
                easeFactor,
                repetitions,
                "good",
                lastReviewedAt,
                createdAt,
                updatedAt);
    }

    private record InvalidBackupCase(String name, SettingsBackupPayload backup) {}

    private record ImportFixture(
            SettingsService service,
            UUID userId,
            UserProfileRepository userProfileRepository,
            ModelSourceRepository modelSourceRepository,
            KnowledgeItemRepository knowledgeItemRepository,
            KnowledgeSourceAssetRepository knowledgeSourceAssetRepository,
            KnowledgeTagRepository knowledgeTagRepository,
            KnowledgeItemTagRepository knowledgeItemTagRepository,
            KnowledgeReviewStateRepository reviewStateRepository) {}
}
