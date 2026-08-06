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
import static org.mockito.Mockito.times;
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
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class SettingsServiceTest {

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
        assertEquals(
                "rag.md", backup.knowledgeItems().getFirst().sourceAsset().originalFilename());
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
        ArgumentCaptor<List<KnowledgeItemTag>> relationCaptor =
                ArgumentCaptor.forClass(List.class);
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
}
