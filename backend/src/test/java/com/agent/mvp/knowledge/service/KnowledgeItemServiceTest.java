package com.agent.mvp.knowledge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.dto.ParsedDocument;
import com.agent.mvp.agent.service.MarkItDownService;
import com.agent.mvp.auth.entity.User;
import com.agent.mvp.ingestion.entity.IngestionJob;
import com.agent.mvp.ingestion.service.IngestionJobService;
import com.agent.mvp.knowledge.dto.ImportSnippetKnowledgeItemRequest;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.knowledge.entity.KnowledgeTag;
import com.agent.mvp.knowledge.repo.KnowledgeItemRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemStatusCountView;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeItemTagView;
import com.agent.mvp.knowledge.repo.KnowledgeTagRepository;
import com.agent.mvp.knowledge.repo.KnowledgeTagUsageSummaryView;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.service.UserProfileService;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
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

        var response = service.search(userId, "rag", null, null, null, null, 1, 20);

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

        service.search(userId, "retrieval augmented generation", null, null, null, null, 1, 20);

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

        service.search(userId, "retrieval", "rag", null, null, null, 1, 20);

        verify(itemTagRepository, never()).findKnowledgeItemIdsByTagId(tag.getId());
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
