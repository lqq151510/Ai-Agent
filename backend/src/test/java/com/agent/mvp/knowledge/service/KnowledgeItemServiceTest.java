package com.agent.mvp.knowledge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.dto.ParsedDocument;
import com.agent.mvp.agent.service.MarkItDownService;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.ConflictException;
import com.agent.mvp.ingestion.entity.IngestionJob;
import com.agent.mvp.ingestion.service.IngestionJobService;
import com.agent.mvp.knowledge.dto.ImportPreflightRequest;
import com.agent.mvp.knowledge.dto.ImportSnippetKnowledgeItemRequest;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.knowledge.entity.KnowledgeSourceAsset;
import com.agent.mvp.knowledge.entity.KnowledgeTag;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemStatusCountView;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagView;
import com.agent.mvp.knowledge.repo.KnowledgeSourceAssetRepository;
import com.agent.mvp.knowledge.repo.KnowledgeTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeTagUsageSummaryView;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.service.UserProfileService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.mock.web.MockMultipartFile;

class KnowledgeItemServiceTest {

    @Test
    void importUploadShouldParseMarkdownFileIntoInboxItem() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeOrganizerService organizerService = new KnowledgeOrganizerService();
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        ObjectMapper objectMapper = new ObjectMapper();

        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        organizerService,
                        markItDownService,
                        userProfileService,
                        objectMapper);

        UUID userId = UUID.randomUUID();
        MockMultipartFile file =
                new MockMultipartFile(
                        "file",
                        "rag-notes.md",
                        "text/markdown",
                        "# RAG\n\nRetrieval augmented generation".getBytes());

        when(markItDownService.parseDocument(any()))
                .thenReturn(
                        new ParsedDocument(
                                "rag-notes.md",
                                "# RAG\n\nRetrieval augmented generation",
                                "md",
                                Collections.singletonMap("title", "RAG Notes")));
        when(itemTagRepository.findTagIdsByKnowledgeItemId(any())).thenReturn(List.of());

        var response = service.importUpload(userId, file, null);

        assertEquals("markdown", response.sourceType());
        assertEquals("RAG Notes", response.title());
        assertEquals("inbox", response.status());
        assertEquals("upload://rag-notes.md", response.sourceUri());
        assertTrue(response.rawContent().contains("Retrieval augmented generation"));

        ArgumentCaptor<KnowledgeItem> itemCaptor = ArgumentCaptor.forClass(KnowledgeItem.class);
        verify(itemRepository).insert(itemCaptor.capture());
        assertEquals("markdown", itemCaptor.getValue().getSourceType());
        assertEquals(
                "5f5762850052fac61f58ed36def304edd152378016ed1ade7e284fd1d19ac7eb",
                itemCaptor.getValue().getContentHash());
        verify(ingestionJobService).createImportSucceeded(eq(userId), eq(response.id()), any());
    }

    @Test
    void importUploadShouldPersistAndReturnOnlySafeManagedSourceAssetMetadata() throws Exception {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeSourceAssetRepository sourceAssetRepository =
                mock(KnowledgeSourceAssetRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        sourceAssetRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        UUID sourceAssetId = UUID.randomUUID();
        byte[] bytes = "managed original bytes".getBytes();
        MockMultipartFile file =
                new MockMultipartFile(
                        "file",
                        "/Users/ze/private/managed-notes.md",
                        "text/markdown",
                        bytes);
        when(itemRepository.selectCount(any())).thenReturn(0L);
        when(markItDownService.parseDocument(any()))
                .thenReturn(new ParsedDocument("managed-notes.md", "# Managed", "md", Map.of()));
        when(itemTagRepository.findTagIdsByKnowledgeItemId(any())).thenReturn(List.of());
        AtomicReference<KnowledgeSourceAsset> storedAsset = new AtomicReference<>();
        Mockito.doAnswer(
                        invocation -> {
                            storedAsset.set(invocation.getArgument(0));
                            return 1;
                        })
                .when(sourceAssetRepository)
                .insert(any(KnowledgeSourceAsset.class));
        when(sourceAssetRepository.selectOne(any())).thenAnswer(invocation -> storedAsset.get());

        var response =
                service.importUpload(
                        userId,
                        file,
                        null,
                        sourceAssetId.toString(),
                        "watched_folder");

        ArgumentCaptor<KnowledgeItem> itemCaptor = ArgumentCaptor.forClass(KnowledgeItem.class);
        verify(itemRepository).insert(itemCaptor.capture());
        KnowledgeSourceAsset persistedAsset = storedAsset.get();
        assertEquals(sourceAssetId, persistedAsset.getId());
        assertEquals(userId, persistedAsset.getUserId());
        assertEquals(response.id(), persistedAsset.getKnowledgeItemId());
        assertEquals(itemCaptor.getValue().getContentHash(), persistedAsset.getContentHash());
        assertEquals("managed-notes.md", persistedAsset.getOriginalFilename());
        assertEquals("text/markdown", persistedAsset.getMediaType());
        assertEquals((long) bytes.length, persistedAsset.getByteSize());
        assertEquals("watched_folder", persistedAsset.getOrigin());
        assertEquals("available", persistedAsset.getAvailability());
        assertEquals("upload://managed-notes.md", response.sourceUri());
        assertEquals(sourceAssetId, response.sourceAsset().id());
        assertEquals("managed-notes.md", response.sourceAsset().originalFilename());
        assertEquals("text/markdown", response.sourceAsset().mediaType());
        assertEquals((long) bytes.length, response.sourceAsset().byteSize());
        assertEquals("watched_folder", response.sourceAsset().origin());
        assertEquals("available", response.sourceAsset().availability());

        String responseJson = new ObjectMapper().findAndRegisterModules().writeValueAsString(response);
        assertFalse(responseJson.contains(persistedAsset.getContentHash()));
        assertFalse(responseJson.contains("contentHash"));
        assertFalse(responseJson.contains("storageKey"));
        assertFalse(responseJson.contains("/Users/ze/private"));
    }

    @Test
    void importUploadShouldRejectUnpairedOrInvalidManagedSourceAssetFieldsBeforeParsing() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeSourceAssetRepository sourceAssetRepository =
                mock(KnowledgeSourceAssetRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        sourceAssetRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());
        MockMultipartFile file =
                new MockMultipartFile("file", "notes.md", "text/markdown", "body".getBytes());

        assertThrows(
                BadRequestException.class,
                () -> service.importUpload(UUID.randomUUID(), file, null, "not-a-uuid", "picker"));
        assertThrows(
                BadRequestException.class,
                () ->
                        service.importUpload(
                                UUID.randomUUID(), file, null, null, "watched_folder"));
        assertThrows(
                BadRequestException.class,
                () ->
                        service.importUpload(
                                UUID.randomUUID(),
                                file,
                                null,
                                UUID.randomUUID().toString(),
                                "untrusted_origin"));

        verifyNoInteractions(markItDownService, sourceAssetRepository);
        verify(itemRepository, never()).insert(any(KnowledgeItem.class));
    }

    @Test
    void importUploadShouldBeIdempotentForSameManagedSourceAssetAndBytes() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeSourceAssetRepository sourceAssetRepository =
                mock(KnowledgeSourceAssetRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        sourceAssetRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        UUID sourceAssetId = UUID.randomUUID();
        KnowledgeItem existingItem =
                KnowledgeItem.builder()
                        .id(itemId)
                        .userId(userId)
                        .sourceType("markdown")
                        .title("notes")
                        .sourceUri("upload://notes.md")
                        .rawContent("parsed body")
                        .status("inbox")
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();
        KnowledgeSourceAsset existingAsset =
                KnowledgeSourceAsset.builder()
                        .id(sourceAssetId)
                        .userId(userId)
                        .knowledgeItemId(itemId)
                        .contentHash(
                                "58100dc8fc06562ce3e578231dc948e083520ee49c4b4ee5a5a28bb4b4003feb")
                        .originalFilename("notes.md")
                        .mediaType("text/markdown")
                        .byteSize(10L)
                        .origin("picker")
                        .availability("available")
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();
        when(sourceAssetRepository.selectById(sourceAssetId)).thenReturn(existingAsset);
        when(sourceAssetRepository.selectOne(any())).thenReturn(existingAsset);
        when(itemRepository.selectById(itemId)).thenReturn(existingItem);
        when(itemTagRepository.findTagIdsByKnowledgeItemId(itemId)).thenReturn(List.of());

        var response =
                service.importUpload(
                        userId,
                        new MockMultipartFile(
                                "file", "notes.md", "text/markdown", "same bytes".getBytes()),
                        null,
                        sourceAssetId.toString(),
                        "picker");

        assertEquals(itemId, response.id());
        assertEquals(sourceAssetId, response.sourceAsset().id());
        verifyNoInteractions(markItDownService);
        verify(itemRepository, never()).selectCount(any());
        verify(itemRepository, never()).insert(any(KnowledgeItem.class));
        verify(ingestionJobService, never()).createImportSucceeded(any(), any(), any());
    }

    @Test
    void importUploadShouldRejectManagedSourceAssetRetryWhenTrustedMetadataDiffers() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeSourceAssetRepository sourceAssetRepository =
                mock(KnowledgeSourceAssetRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        sourceAssetRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        mock(UserProfileService.class),
                        new ObjectMapper());
        UUID userId = UUID.randomUUID();
        UUID sourceAssetId = UUID.randomUUID();
        when(sourceAssetRepository.selectById(sourceAssetId))
                .thenReturn(
                        KnowledgeSourceAsset.builder()
                                .id(sourceAssetId)
                                .userId(userId)
                                .knowledgeItemId(UUID.randomUUID())
                                .contentHash(
                                        "58100dc8fc06562ce3e578231dc948e083520ee49c4b4ee5a5a28bb4b4003feb")
                                .originalFilename("notes.md")
                                .mediaType("text/markdown")
                                .byteSize(10L)
                                .origin("picker")
                                .availability("available")
                                .build());

        ConflictException exception =
                assertThrows(
                        ConflictException.class,
                        () ->
                                service.importUpload(
                                        userId,
                                        new MockMultipartFile(
                                                "file",
                                                "notes.md",
                                                "text/markdown",
                                                "same bytes".getBytes()),
                                        null,
                                        sourceAssetId.toString(),
                                        "watched_folder"));

        assertEquals("Managed source asset conflicts with an existing import", exception.getMessage());
        verifyNoInteractions(markItDownService);
        verify(itemRepository, never()).insert(any(KnowledgeItem.class));
    }

    @Test
    void importFileShouldSanitizeLocalSourceUriBeforePersistingAndResponding() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        mock(MarkItDownService.class),
                        userProfileService,
                        new ObjectMapper());
        UUID userId = UUID.randomUUID();
        when(itemTagRepository.findTagIdsByKnowledgeItemId(any())).thenReturn(List.of());

        var response =
                service.importFile(
                        userId,
                        new com.agent.mvp.knowledge.dto.ImportFileKnowledgeItemRequest(
                                null,
                                "markdown",
                                "file:///Users/ze/private/legacy-notes.md",
                                "safe text"));

        ArgumentCaptor<KnowledgeItem> itemCaptor = ArgumentCaptor.forClass(KnowledgeItem.class);
        verify(itemRepository).insert(itemCaptor.capture());
        assertEquals("upload://legacy-notes.md", itemCaptor.getValue().getSourceUri());
        assertEquals("upload://legacy-notes.md", response.sourceUri());
        ArgumentCaptor<String> jobMetadataCaptor = ArgumentCaptor.forClass(String.class);
        verify(ingestionJobService)
                .createImportSucceeded(eq(userId), eq(response.id()), jobMetadataCaptor.capture());
        assertFalse(jobMetadataCaptor.getValue().contains("/Users/ze/private"));
    }

    @Test
    void importUploadShouldRejectExistingBytesBeforeParsing() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        MockMultipartFile file =
                new MockMultipartFile("file", "notes.md", "text/markdown", "same bytes".getBytes());
        when(itemRepository.selectCount(any())).thenReturn(1L);

        ConflictException exception =
                assertThrows(ConflictException.class, () -> service.importUpload(userId, file, null));

        assertEquals("An identical file has already been imported", exception.getMessage());
        verifyNoInteractions(markItDownService);
        ArgumentCaptor<QueryWrapper> wrapperCaptor = ArgumentCaptor.forClass(QueryWrapper.class);
        verify(itemRepository).selectCount(wrapperCaptor.capture());
        String sqlSegment = wrapperCaptor.getValue().getCustomSqlSegment();
        assertTrue(sqlSegment.contains("user_id"));
        assertTrue(sqlSegment.contains("content_hash"));
        assertTrue(wrapperCaptor.getValue().getParamNameValuePairs().containsValue(userId));
        assertTrue(
                wrapperCaptor
                        .getValue()
                        .getParamNameValuePairs()
                        .containsValue(
                                "58100dc8fc06562ce3e578231dc948e083520ee49c4b4ee5a5a28bb4b4003feb"));
        verify(itemRepository, never()).insert(any(KnowledgeItem.class));
    }

    @Test
    void importUploadShouldAllowSameFilenameWhenBytesDiffer() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        when(itemRepository.selectCount(any())).thenReturn(0L);
        when(markItDownService.parseDocument(any()))
                .thenReturn(new ParsedDocument("notes.md", "notes", "md", Map.of()));
        when(itemTagRepository.findTagIdsByKnowledgeItemId(any())).thenReturn(List.of());

        service.importUpload(
                userId,
                new MockMultipartFile(
                        "file", "notes.md", "text/markdown", "first version".getBytes()),
                null);
        service.importUpload(
                userId,
                new MockMultipartFile(
                        "file", "notes.md", "text/markdown", "second version".getBytes()),
                null);

        ArgumentCaptor<KnowledgeItem> itemCaptor = ArgumentCaptor.forClass(KnowledgeItem.class);
        verify(itemRepository, Mockito.times(2)).insert(itemCaptor.capture());
        assertEquals(
                List.of(
                        "80d8f975e768eecac59d22a788bf8e811e51ca85e309ee47f1e821e3e58280f2",
                        "ebfa015966891a400bf353bdf8ef30444a71b1751e2808ef6c014db34d168d85"),
                itemCaptor.getAllValues().stream().map(KnowledgeItem::getContentHash).toList());
    }

    @Test
    void importUploadShouldAllowSameBytesForDifferentUsers() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());

        UUID firstUserId = UUID.randomUUID();
        UUID secondUserId = UUID.randomUUID();
        when(itemRepository.selectCount(any())).thenReturn(0L);
        when(markItDownService.parseDocument(any()))
                .thenReturn(new ParsedDocument("notes.md", "notes", "md", Map.of()));
        when(itemTagRepository.findTagIdsByKnowledgeItemId(any())).thenReturn(List.of());

        service.importUpload(
                firstUserId,
                new MockMultipartFile("file", "notes.md", "text/markdown", "same bytes".getBytes()),
                null);
        service.importUpload(
                secondUserId,
                new MockMultipartFile("file", "notes.md", "text/markdown", "same bytes".getBytes()),
                null);

        ArgumentCaptor<KnowledgeItem> itemCaptor = ArgumentCaptor.forClass(KnowledgeItem.class);
        verify(itemRepository, Mockito.times(2)).insert(itemCaptor.capture());
        assertEquals(
                List.of(firstUserId, secondUserId),
                itemCaptor.getAllValues().stream().map(KnowledgeItem::getUserId).toList());
        assertEquals(
                List.of(
                        "58100dc8fc06562ce3e578231dc948e083520ee49c4b4ee5a5a28bb4b4003feb",
                        "58100dc8fc06562ce3e578231dc948e083520ee49c4b4ee5a5a28bb4b4003feb"),
                itemCaptor.getAllValues().stream().map(KnowledgeItem::getContentHash).toList());

        ArgumentCaptor<QueryWrapper> wrapperCaptor = ArgumentCaptor.forClass(QueryWrapper.class);
        verify(itemRepository, Mockito.times(2)).selectCount(wrapperCaptor.capture());
        List<QueryWrapper> wrappers = wrapperCaptor.getAllValues();
        assertTrue(wrappers.get(0).getCustomSqlSegment().contains("user_id"));
        assertTrue(wrappers.get(1).getCustomSqlSegment().contains("user_id"));
        assertTrue(wrappers.get(0).getParamNameValuePairs().containsValue(firstUserId));
        assertTrue(wrappers.get(1).getParamNameValuePairs().containsValue(secondUserId));
    }

    @Test
    void preflightImportShouldReturnOnlyCurrentUsersExistingHashes() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        String existing = "a".repeat(64);
        String missing = "b".repeat(64);
        when(itemRepository.selectList(any()))
                .thenReturn(List.of(KnowledgeItem.builder().contentHash(existing).build()));

        var response =
                service.preflightImport(
                        userId, new ImportPreflightRequest(List.of(existing.toUpperCase(), missing)));

        assertEquals(List.of(existing), response.existingContentHashes());
        ArgumentCaptor<QueryWrapper> wrapperCaptor = ArgumentCaptor.forClass(QueryWrapper.class);
        verify(itemRepository).selectList(wrapperCaptor.capture());
        String sqlSegment = wrapperCaptor.getValue().getCustomSqlSegment();
        assertEquals("content_hash", wrapperCaptor.getValue().getSqlSelect());
        assertTrue(sqlSegment.contains("user_id"));
        assertTrue(sqlSegment.contains("content_hash"));
        assertTrue(wrapperCaptor.getValue().getParamNameValuePairs().containsValue(userId));
        assertTrue(wrapperCaptor.getValue().getParamNameValuePairs().containsValue(existing));
        assertTrue(wrapperCaptor.getValue().getParamNameValuePairs().containsValue(missing));
        verify(itemRepository, never()).insert(any(KnowledgeItem.class));
    }

    @Test
    void importUploadShouldMapConcurrentHashDuplicateToConflict() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        when(itemRepository.selectCount(any())).thenReturn(0L);
        when(markItDownService.parseDocument(any()))
                .thenReturn(new ParsedDocument("notes.md", "notes", "md", Map.of()));
        when(itemRepository.insert(any(KnowledgeItem.class)))
                .thenThrow(
                        new DuplicateKeyException(
                                "uq_knowledge_items_user_content_hash duplicate key"));

        ConflictException exception =
                assertThrows(
                        ConflictException.class,
                        () ->
                                service.importUpload(
                                        userId,
                                        new MockMultipartFile(
                                                "file",
                                                "notes.md",
                                                "text/markdown",
                                                "racing bytes".getBytes()),
                                        null));

        assertEquals("An identical file has already been imported", exception.getMessage());
        verify(ingestionJobService, never()).createImportSucceeded(any(), any(), any());
    }

    @Test
    void importSnippetShouldAutoOrganizeWhenProfileModeIsAuto() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeOrganizerService organizerService = mock(KnowledgeOrganizerService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        ObjectMapper objectMapper = new ObjectMapper();

        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        organizerService,
                        markItDownService,
                        userProfileService,
                        objectMapper);

        UUID userId = UUID.randomUUID();
        AtomicReference<KnowledgeItem> stored = new AtomicReference<>();
        when(userProfileService.getOrCreate(userId))
                .thenReturn(UserProfile.builder().userId(userId).organizeMode("auto").build());
        when(itemRepository.update(any(), any())).thenReturn(1);
        Mockito.doAnswer(
                        invocation -> {
                            KnowledgeItem item = invocation.getArgument(0);
                            stored.set(item);
                            return 1;
                        })
                .when(itemRepository)
                .insert(any(KnowledgeItem.class));
        Mockito.doAnswer(
                        invocation -> {
                            KnowledgeItem item = invocation.getArgument(0);
                            stored.set(item);
                            return 1;
                        })
                .when(itemRepository)
                .updateById(any(KnowledgeItem.class));
        when(itemTagRepository.findTagIdsByKnowledgeItemId(any())).thenReturn(List.of());
        when(tagRepository.selectOne(any())).thenReturn(null);
        when(organizerService.organize(any()))
                .thenReturn(
                        new KnowledgeOrganizerService.OrganizeResult(
                                "cleaned text", "summary text", List.of("rag", "llm"), "en", 12));
        when(ingestionJobService.createRunning(eq(userId), any(), eq("organize"), any()))
                .thenReturn(
                        IngestionJob.builder()
                                .id(UUID.randomUUID())
                                .userId(userId)
                                .knowledgeItemId(UUID.randomUUID())
                                .jobType("organize")
                                .status("running")
                                .build());

        var response =
                service.importSnippet(
                        userId,
                        new ImportSnippetKnowledgeItemRequest(
                                "RAG note", "retrieval augmented generation"));

        assertEquals("ready", response.status());
        assertEquals("summary text", response.summary());
        assertEquals("cleaned text", response.cleanedContent());
        verify(ingestionJobService).createImportSucceeded(eq(userId), eq(response.id()), any());
        verify(ingestionJobService)
                .createRunning(eq(userId), eq(response.id()), eq("organize"), any());
        ArgumentCaptor<String> resultSnapshotCaptor = ArgumentCaptor.forClass(String.class);
        verify(ingestionJobService)
                .markSucceeded(any(IngestionJob.class), resultSnapshotCaptor.capture());
        assertTrue(
                resultSnapshotCaptor.getValue().contains("\"organizationStrategy\":\"heuristic\""));
    }

    @Test
    void reprocessShouldCreateReprocessJobAndReturnReadyItem() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeOrganizerService organizerService = mock(KnowledgeOrganizerService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        ObjectMapper objectMapper = new ObjectMapper();

        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        organizerService,
                        markItDownService,
                        userProfileService,
                        objectMapper);

        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        AtomicReference<KnowledgeItem> stored = new AtomicReference<>();
        KnowledgeItem item =
                KnowledgeItem.builder()
                        .id(itemId)
                        .userId(userId)
                        .sourceType("snippet")
                        .title("Failed note")
                        .rawContent("retry this note")
                        .status("failed")
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();

        when(itemRepository.selectById(itemId)).thenReturn(item);
        when(itemRepository.update(any(), any())).thenReturn(1);
        Mockito.doAnswer(
                        invocation -> {
                            KnowledgeItem updated = invocation.getArgument(0);
                            stored.set(updated);
                            return 1;
                        })
                .when(itemRepository)
                .updateById(any(KnowledgeItem.class));
        when(itemTagRepository.findTagIdsByKnowledgeItemId(any())).thenReturn(List.of());
        when(tagRepository.selectOne(any())).thenReturn(null);
        when(organizerService.organize(any()))
                .thenReturn(
                        new KnowledgeOrganizerService.OrganizeResult(
                                "cleaned text",
                                "retry summary",
                                List.of("retry", "note"),
                                "en",
                                8));
        when(ingestionJobService.createRunning(eq(userId), eq(itemId), eq("reprocess"), any()))
                .thenReturn(
                        IngestionJob.builder()
                                .id(UUID.randomUUID())
                                .userId(userId)
                                .knowledgeItemId(itemId)
                                .jobType("reprocess")
                                .status("running")
                                .build());

        var response = service.reprocess(userId, itemId);

        assertEquals("ready", response.status());
        assertEquals("retry summary", response.summary());
        verify(ingestionJobService).createRunning(eq(userId), eq(itemId), eq("reprocess"), any());
        verify(ingestionJobService).markSucceeded(any(IngestionJob.class), any());
    }

    @Test
    void archiveShouldRejectWhenConcurrentOrganizeClaimHasSetProcessing() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        KnowledgeItem item =
                KnowledgeItem.builder()
                        .id(itemId)
                        .userId(userId)
                        .sourceType("snippet")
                        .title("Racing item")
                        .rawContent("content")
                        .status("ready")
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();
        when(itemRepository.selectById(itemId)).thenReturn(item);
        // A zero-row conditional update represents organize claiming the item after it was read.
        when(itemRepository.update(any(), any())).thenReturn(0);

        BadRequestException exception =
                assertThrows(BadRequestException.class, () -> service.archive(userId, itemId));

        assertEquals("Processing item cannot be archived", exception.getMessage());
        assertEquals("ready", item.getStatus());
        assertNull(item.getArchivedAt());
        ArgumentCaptor<UpdateWrapper> wrapperCaptor = ArgumentCaptor.forClass(UpdateWrapper.class);
        verify(itemRepository).update(Mockito.isNull(), wrapperCaptor.capture());
        assertTrue(wrapperCaptor.getValue().getCustomSqlSegment().contains("status"));
        assertTrue(
                wrapperCaptor
                        .getValue()
                        .getParamNameValuePairs()
                        .containsValue("processing"));
        verify(itemRepository, never()).updateById(any(KnowledgeItem.class));
    }

    @Test
    void organizeBatchShouldProcessInboxAndFailedItems() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeOrganizerService organizerService = mock(KnowledgeOrganizerService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        ObjectMapper objectMapper = new ObjectMapper();

        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        organizerService,
                        markItDownService,
                        userProfileService,
                        objectMapper);

        UUID userId = UUID.randomUUID();
        KnowledgeItem inboxItem =
                KnowledgeItem.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .sourceType("snippet")
                        .title("Inbox one")
                        .rawContent("first item")
                        .status("inbox")
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();
        KnowledgeItem failedItem =
                KnowledgeItem.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .sourceType("snippet")
                        .title("Failed one")
                        .rawContent("second item")
                        .status("failed")
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();

        when(itemRepository.selectList(any())).thenReturn(List.of(inboxItem, failedItem));
        when(itemRepository.update(any(), any())).thenReturn(1);
        when(itemTagRepository.findTagIdsByKnowledgeItemId(any())).thenReturn(List.of());
        when(tagRepository.selectOne(any())).thenReturn(null);
        when(organizerService.organize(any()))
                .thenReturn(
                        new KnowledgeOrganizerService.OrganizeResult(
                                "cleaned batch", "batch summary", List.of("batch"), "en", 5));
        when(ingestionJobService.createRunning(eq(userId), any(), eq("organize"), any()))
                .thenReturn(
                        IngestionJob.builder()
                                .id(UUID.randomUUID())
                                .userId(userId)
                                .knowledgeItemId(UUID.randomUUID())
                                .jobType("organize")
                                .status("running")
                                .build());

        var response = service.organizeBatch(userId, 10, true);

        assertEquals(2, response.selectedCount());
        assertEquals(2, response.succeededCount());
        assertEquals(0, response.failedCount());
        verify(ingestionJobService, Mockito.times(2))
                .createRunning(eq(userId), any(), eq("organize"), any());
        verify(ingestionJobService, Mockito.times(2)).markSucceeded(any(IngestionJob.class), any());
    }

    @Test
    void searchShouldBatchLoadTagsForReturnedPage() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeOrganizerService organizerService = new KnowledgeOrganizerService();
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        ObjectMapper objectMapper = new ObjectMapper();

        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        organizerService,
                        markItDownService,
                        userProfileService,
                        objectMapper);

        UUID userId = UUID.randomUUID();
        UUID firstItemId = UUID.randomUUID();
        UUID secondItemId = UUID.randomUUID();
        KnowledgeItem firstItem =
                KnowledgeItem.builder()
                        .id(firstItemId)
                        .userId(userId)
                        .sourceType("markdown")
                        .title("RAG Index")
                        .rawContent("retrieval notes")
                        .cleanedContent("clean retrieval notes")
                        .status("ready")
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();
        KnowledgeItem secondItem =
                KnowledgeItem.builder()
                        .id(secondItemId)
                        .userId(userId)
                        .sourceType("pdf")
                        .title("Vector Search")
                        .rawContent("embedding notes")
                        .cleanedContent("clean embedding notes")
                        .status("ready")
                        .createdAt(Instant.now())
                        .updatedAt(Instant.now())
                        .build();

        Mockito.doAnswer(
                        invocation -> {
                            Page<KnowledgeItem> page = invocation.getArgument(0);
                            page.setRecords(List.of(firstItem, secondItem));
                            page.setTotal(2);
                            return page;
                        })
                .when(itemRepository)
                .selectPage(any(), any());

        KnowledgeItemTagView ragTag = tagView(firstItemId, "rag");
        KnowledgeItemTagView searchTag = tagView(secondItemId, "search");
        when(itemTagRepository.findTagsByKnowledgeItemIds(
                        argThat(ids -> ids.contains(firstItemId) && ids.contains(secondItemId))))
                .thenReturn(List.of(ragTag, searchTag));

        var response = service.search(userId, "rag", null, null, null, null, null, 1, 20);

        ArgumentCaptor<QueryWrapper> wrapperCaptor = ArgumentCaptor.forClass(QueryWrapper.class);
        verify(itemRepository).selectPage(any(), wrapperCaptor.capture());
        String sqlSelect = wrapperCaptor.getValue().getSqlSelect();

        assertEquals(2, response.items().size());
        assertTrue(sqlSelect.contains("SUBSTRING("));
        assertTrue(sqlSelect.contains("AS summary"));
        assertTrue(sqlSelect.contains("source_uri"));
        assertTrue(sqlSelect.contains("updated_at"));
        assertNull(response.items().get(0).rawContent());
        assertNull(response.items().get(0).cleanedContent());
        assertNull(response.items().get(1).rawContent());
        assertNull(response.items().get(1).cleanedContent());
        assertEquals("clean retrieval notes", response.items().get(0).summary());
        assertEquals("clean embedding notes", response.items().get(1).summary());
        assertEquals(
                List.of("rag"),
                response.items().get(0).tags().stream().map(tag -> tag.name()).toList());
        assertEquals(
                List.of("search"),
                response.items().get(1).tags().stream().map(tag -> tag.name()).toList());
        verify(itemTagRepository, never()).findTagIdsByKnowledgeItemId(firstItemId);
        verify(itemTagRepository, never()).findTagIdsByKnowledgeItemId(secondItemId);
    }

    @Test
    void searchShouldUsePostgresFullTextPredicateWhenEnabled() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeOrganizerService organizerService = new KnowledgeOrganizerService();
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        ObjectMapper objectMapper = new ObjectMapper();

        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        organizerService,
                        markItDownService,
                        userProfileService,
                        objectMapper,
                        true,
                        null);

        UUID userId = UUID.randomUUID();
        Mockito.doAnswer(
                        invocation -> {
                            Page<KnowledgeItem> page = invocation.getArgument(0);
                            page.setRecords(List.of());
                            page.setTotal(0);
                            return page;
                        })
                .when(itemRepository)
                .selectPage(any(), any());

        service.search(
                userId, "retrieval augmented generation", null, null, null, null, null, 1, 20);

        ArgumentCaptor<QueryWrapper> wrapperCaptor = ArgumentCaptor.forClass(QueryWrapper.class);
        verify(itemRepository).selectPage(any(), wrapperCaptor.capture());
        String sqlSegment = wrapperCaptor.getValue().getCustomSqlSegment();

        assertTrue(sqlSegment.contains("to_tsvector"));
        assertTrue(sqlSegment.contains("websearch_to_tsquery"));
        assertFalse(sqlSegment.contains(" LIKE "));
    }

    @Test
    void retrievalIndexMigrationsShouldCoverSearchAndCommonFilters() throws Exception {
        String postgresSql =
                Files.readString(
                        Path.of(
                                "src/main/resources/db/migration/V10__knowledge_retrieval_indexes.sql"));
        String h2Sql =
                Files.readString(
                        Path.of("src/main/resources/db/h2/V10__knowledge_retrieval_indexes.sql"));

        assertTrue(postgresSql.contains("idx_knowledge_items_search_fts"));
        assertTrue(postgresSql.contains("USING GIN"));
        assertTrue(postgresSql.contains("to_tsvector"));
        assertTrue(postgresSql.contains("idx_knowledge_items_user_status_updated"));
        assertTrue(h2Sql.contains("idx_knowledge_items_user_status_updated"));
    }

    @Test
    void contentHashMigrationsShouldKeepHashNullableAndScopedToUser() throws Exception {
        String postgresSql =
                Files.readString(
                        Path.of(
                                "src/main/resources/db/migration/"
                                        + "V11__knowledge_item_content_hash_deduplication.sql"));
        String h2Sql =
                Files.readString(
                        Path.of(
                                "src/main/resources/db/h2/"
                                        + "V11__knowledge_item_content_hash_deduplication.sql"));

        assertTrue(postgresSql.contains("ADD COLUMN content_hash VARCHAR(64)"));
        assertTrue(postgresSql.contains("uq_knowledge_items_user_content_hash"));
        assertTrue(postgresSql.contains("user_id, content_hash"));
        assertTrue(postgresSql.contains("WHERE content_hash IS NOT NULL"));
        assertTrue(h2Sql.contains("ADD COLUMN content_hash VARCHAR(64)"));
        assertTrue(h2Sql.contains("uq_knowledge_items_user_content_hash"));
        assertTrue(h2Sql.contains("user_id, content_hash"));
    }

    @Test
    void sourceAssetMigrationsShouldStoreOnlySafeMetadataForPostgresAndH2() throws Exception {
        String postgresSql =
                Files.readString(
                        Path.of(
                                "src/main/resources/db/migration/"
                                        + "V12__knowledge_source_assets.sql"));
        String h2Sql =
                Files.readString(
                        Path.of(
                                "src/main/resources/db/h2/"
                                        + "V12__knowledge_source_assets.sql"));

        for (String migration : List.of(postgresSql, h2Sql)) {
            assertTrue(migration.contains("CREATE TABLE knowledge_source_assets"));
            assertTrue(migration.contains("user_id UUID NOT NULL"));
            assertTrue(migration.contains("knowledge_item_id UUID NOT NULL"));
            assertTrue(migration.contains("content_hash VARCHAR(64)"));
            assertTrue(migration.contains("original_filename VARCHAR(512) NOT NULL"));
            assertTrue(migration.contains("media_type VARCHAR(120) NOT NULL"));
            assertTrue(migration.contains("byte_size BIGINT NOT NULL"));
            assertTrue(migration.contains("origin IN ('picker', 'watched_folder')"));
            assertTrue(migration.contains("availability IN ('pending', 'available', 'missing')"));
            assertTrue(migration.contains("FOREIGN KEY (knowledge_item_id)"));
            assertTrue(migration.contains("uq_knowledge_source_assets_item"));
            assertFalse(migration.toLowerCase().contains("storage_key"));
            assertFalse(migration.toLowerCase().contains("local_path"));
            assertFalse(migration.toLowerCase().contains("binary"));
        }
    }

    @Test
    void tagFilterShouldNotLoadAllTaggedItemIdsIntoMemory() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeOrganizerService organizerService = new KnowledgeOrganizerService();
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        ObjectMapper objectMapper = new ObjectMapper();

        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        organizerService,
                        markItDownService,
                        userProfileService,
                        objectMapper);

        UUID userId = UUID.randomUUID();
        KnowledgeTag tag =
                KnowledgeTag.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .name("rag")
                        .color("#7a8a84")
                        .createdAt(Instant.now())
                        .build();

        when(tagRepository.selectOne(any())).thenReturn(tag);
        Mockito.doAnswer(
                        invocation -> {
                            Page<KnowledgeItem> page = invocation.getArgument(0);
                            page.setRecords(List.of());
                            page.setTotal(0);
                            return page;
                        })
                .when(itemRepository)
                .selectPage(any(), any());

        service.search(userId, "retrieval", null, "rag", null, null, null, 1, 20);

        verify(itemTagRepository, never()).findKnowledgeItemIdsByTagId(tag.getId());
    }

    @Test
    void searchShouldApplyStatusFilterAndReturnNormalizedPagination() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeOrganizerService organizerService = new KnowledgeOrganizerService();
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);

        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        organizerService,
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        Mockito.doAnswer(
                        invocation -> {
                            Page<KnowledgeItem> page = invocation.getArgument(0);
                            page.setRecords(List.of());
                            page.setTotal(0);
                            return page;
                        })
                .when(itemRepository)
                .selectPage(any(), any());

        var response = service.search(userId, null, "READY", null, null, null, null, 0, 500);

        ArgumentCaptor<Page> pageCaptor = ArgumentCaptor.forClass(Page.class);
        ArgumentCaptor<QueryWrapper> wrapperCaptor = ArgumentCaptor.forClass(QueryWrapper.class);
        verify(itemRepository).selectPage(pageCaptor.capture(), wrapperCaptor.capture());
        assertEquals(1L, pageCaptor.getValue().getCurrent());
        assertEquals(100L, pageCaptor.getValue().getSize());
        assertTrue(wrapperCaptor.getValue().getCustomSqlSegment().contains("status"));
        assertEquals(1L, response.page());
        assertEquals(100L, response.pageSize());
    }

    @Test
    void listShouldUnionMultipleStatusesWithServerSidePaging() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        new KnowledgeOrganizerService(),
                        markItDownService,
                        userProfileService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        Mockito.doAnswer(
                        invocation -> {
                            Page<KnowledgeItem> page = invocation.getArgument(0);
                            page.setRecords(List.of());
                            page.setTotal(23);
                            return page;
                        })
                .when(itemRepository)
                .selectPage(any(), any());

        Instant from = Instant.parse("2026-07-01T00:00:00Z");
        Instant to = Instant.parse("2026-07-29T23:59:59Z");
        var response =
                service.listItems(
                        userId,
                        List.of("inbox", "processing", "failed"),
                        "markdown",
                        null,
                        from,
                        to,
                        0,
                        500);

        ArgumentCaptor<Page> pageCaptor = ArgumentCaptor.forClass(Page.class);
        ArgumentCaptor<QueryWrapper> wrapperCaptor = ArgumentCaptor.forClass(QueryWrapper.class);
        verify(itemRepository).selectPage(pageCaptor.capture(), wrapperCaptor.capture());

        QueryWrapper wrapper = wrapperCaptor.getValue();
        String sqlSegment = wrapper.getCustomSqlSegment();
        assertEquals(1L, pageCaptor.getValue().getCurrent());
        assertEquals(100L, pageCaptor.getValue().getSize());
        assertEquals(23L, response.total());
        assertTrue(sqlSegment.contains("status"));
        assertTrue(sqlSegment.contains("IN"));
        assertTrue(sqlSegment.contains("source_type"));
        assertTrue(sqlSegment.contains("created_at"));
        assertTrue(wrapper.getParamNameValuePairs().containsValue("inbox"));
        assertTrue(wrapper.getParamNameValuePairs().containsValue("processing"));
        assertTrue(wrapper.getParamNameValuePairs().containsValue("failed"));
    }

    @Test
    void dashboardShouldUseLightweightRecentItemsAndBatchTagUsageCounts() {
        KnowledgeItemRepository itemRepository = mock(KnowledgeItemRepository.class);
        KnowledgeTagRepository tagRepository = mock(KnowledgeTagRepository.class);
        KnowledgeItemTagRepository itemTagRepository = mock(KnowledgeItemTagRepository.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeOrganizerService organizerService = new KnowledgeOrganizerService();
        MarkItDownService markItDownService = mock(MarkItDownService.class);
        UserProfileService userProfileService = mock(UserProfileService.class);
        ObjectMapper objectMapper = new ObjectMapper();

        KnowledgeItemService service =
                new KnowledgeItemService(
                        itemRepository,
                        tagRepository,
                        itemTagRepository,
                        ingestionJobService,
                        organizerService,
                        markItDownService,
                        userProfileService,
                        objectMapper);

        UUID userId = UUID.randomUUID();
        KnowledgeItem recentItem =
                KnowledgeItem.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .sourceType("markdown")
                        .title("Recent RAG note")
                        .rawContent("large body should not be selected")
                        .cleanedContent("large cleaned body should not be selected")
                        .status("ready")
                        .updatedAt(Instant.now())
                        .build();
        when(userProfileService.requireUser(userId))
                .thenReturn(User.builder().id(userId).email("ze@example.com").build());
        when(itemRepository.selectList(any())).thenReturn(List.of(recentItem));
        when(itemRepository.findStatusCountsByUserId(userId))
                .thenReturn(
                        List.of(
                                statusCount("ready", 4),
                                statusCount("failed", 2),
                                statusCount("archived", 1)));
        when(itemTagRepository.findTopTagUsageByUserId(userId, 5))
                .thenReturn(
                        List.of(
                                tagSummary("rag", "#7a8a84", 7),
                                tagSummary("search", "#a97751", 3)));

        var response = service.dashboardSummary(userId);

        ArgumentCaptor<QueryWrapper> itemWrapperCaptor =
                ArgumentCaptor.forClass(QueryWrapper.class);
        verify(itemRepository).selectList(itemWrapperCaptor.capture());
        String sqlSelect = itemWrapperCaptor.getValue().getSqlSelect();

        assertEquals(1, response.recentItems().size());
        assertEquals(7, response.totalItems());
        assertEquals(4, response.readyItems());
        assertEquals(2, response.failedItems());
        assertEquals("rag", response.topTags().get(0).name());
        assertEquals(7, response.topTags().get(0).usageCount());
        assertTrue(sqlSelect.contains("title"));
        assertFalse(sqlSelect.contains("raw_content"));
        assertFalse(sqlSelect.contains("cleaned_content"));
        verify(tagRepository, never()).selectList(any());
        verify(itemTagRepository, never()).findTagsByKnowledgeItemIds(any());
        verify(itemTagRepository, never()).findKnowledgeItemIdsByTagId(any(UUID.class));
    }

    private KnowledgeItemTagView tagView(UUID itemId, String name) {
        KnowledgeItemTagView view = new KnowledgeItemTagView();
        view.setKnowledgeItemId(itemId);
        view.setTagId(UUID.randomUUID());
        view.setName(name);
        view.setColor("#7a8a84");
        view.setCreatedAt(Instant.now());
        return view;
    }

    private KnowledgeItemStatusCountView statusCount(String status, long itemCount) {
        KnowledgeItemStatusCountView view = new KnowledgeItemStatusCountView();
        view.setStatus(status);
        view.setItemCount(itemCount);
        return view;
    }

    private KnowledgeTagUsageSummaryView tagSummary(String name, String color, long usageCount) {
        KnowledgeTagUsageSummaryView view = new KnowledgeTagUsageSummaryView();
        view.setTagId(UUID.randomUUID());
        view.setName(name);
        view.setColor(color);
        view.setUsageCount(usageCount);
        return view;
    }
}
