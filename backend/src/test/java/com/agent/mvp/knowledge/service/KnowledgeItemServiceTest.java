package com.agent.mvp.knowledge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.dto.ParsedDocument;
import com.agent.mvp.agent.service.MarkItDownService;
import com.agent.mvp.ingestion.service.IngestionJobService;
import com.agent.mvp.ingestion.entity.IngestionJob;
import com.agent.mvp.knowledge.dto.ImportSnippetKnowledgeItemRequest;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeTagRepository;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.service.UserProfileService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
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
        verify(ingestionJobService).createImportSucceeded(eq(userId), eq(response.id()), any());
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
                                "cleaned text",
                                "summary text",
                                List.of("rag", "llm"),
                                "en",
                                12));
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
                        userId, new ImportSnippetKnowledgeItemRequest("RAG note", "retrieval augmented generation"));

        assertEquals("ready", response.status());
        assertEquals("summary text", response.summary());
        assertEquals("cleaned text", response.cleanedContent());
        verify(ingestionJobService).createImportSucceeded(eq(userId), eq(response.id()), any());
        verify(ingestionJobService).createRunning(eq(userId), eq(response.id()), eq("organize"), any());
        verify(ingestionJobService).markSucceeded(any(IngestionJob.class), any());
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
        when(itemTagRepository.findTagIdsByKnowledgeItemId(any())).thenReturn(List.of());
        when(tagRepository.selectOne(any())).thenReturn(null);
        when(organizerService.organize(any()))
                .thenReturn(
                        new KnowledgeOrganizerService.OrganizeResult(
                                "cleaned batch",
                                "batch summary",
                                List.of("batch"),
                                "en",
                                5));
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
        verify(ingestionJobService, Mockito.times(2)).createRunning(eq(userId), any(), eq("organize"), any());
        verify(ingestionJobService, Mockito.times(2)).markSucceeded(any(IngestionJob.class), any());
    }
}
