package com.agent.mvp.agent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.search.EmbeddingStoreProvider;
import com.agent.mvp.agent.search.SearchOrchestrator;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchResult;
import dev.langchain4j.store.embedding.EmbeddingStore;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class RAGMemoryServiceTest {

    @Test
    void searchSimilarDiagnosesSendsUserFilterToEmbeddingStore() {
        UUID userId = UUID.randomUUID();
        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        @SuppressWarnings("unchecked")
        EmbeddingStore<TextSegment> store = mock(EmbeddingStore.class);
        Embedding embedding = Embedding.from(new float[] {1.0f});
        when(provider.tryEmbedQuery("timeout")).thenReturn(embedding);
        when(provider.getEmbeddingStore()).thenReturn(store);
        when(store.search(
                        argThat(
                                request ->
                                        request.filter() != null
                                                && request.filter()
                                                        .toString()
                                                        .contains(userId.toString()))))
                .thenReturn(
                        new EmbeddingSearchResult<>(
                                List.of(
                                        match(
                                                "owned",
                                                Metadata.from("userId", userId.toString()),
                                                embedding))));

        RAGMemoryService service = service(provider);

        assertEquals(List.of("owned"), service.searchSimilarDiagnoses(userId, "timeout", 5));
        assertEquals(List.of(), service.searchSimilarDiagnoses(null, "timeout", 5));
    }

    @Test
    void listAllMemoriesMapsMetadataWithoutUnsafeStringCast() {
        UUID userId = UUID.randomUUID();
        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(provider.getJdbcTemplate()).thenReturn(jdbcTemplate);
        when(jdbcTemplate.queryForList(
                        org.mockito.ArgumentMatchers.contains("metadata::text AS metadata"),
                        eq(userId.toString())))
                .thenReturn(
                        List.of(
                                Map.of(
                                        "embedding_id", UUID.randomUUID(),
                                        "text", "owned",
                                        "metadata",
                                                new StringBuilder("{\"userId\":\"")
                                                        .append(userId)
                                                        .append("\"}"))));

        List<Map<String, Object>> memories = service(provider).listAllMemories(userId);

        assertEquals(1, memories.size());
        assertEquals("owned", memories.getFirst().get("text"));
        assertEquals("{\"userId\":\"" + userId + "\"}", memories.getFirst().get("metadata"));
    }

    @Test
    void ingestTextShouldBeIdempotentForSameItemIdAndContent() {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        String content = "Test content for deduplication";
        String title = "Doc Title";

        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        @SuppressWarnings("unchecked")
        EmbeddingStore<TextSegment> store = mock(EmbeddingStore.class);
        dev.langchain4j.model.embedding.EmbeddingModel model =
                mock(dev.langchain4j.model.embedding.EmbeddingModel.class);
        Embedding embedding = Embedding.from(new float[] {1.0f});
        when(provider.getEmbeddingStore()).thenReturn(store);
        when(provider.getEmbeddingModel()).thenReturn(model);
        when(model.embedAll(any()))
                .thenReturn(dev.langchain4j.model.output.Response.from(List.of(embedding)));

        RAGMemoryService service = service(provider);

        assertFalse(service.isAlreadyIngested(itemId, content));

        // First ingestion
        service.ingestText(userId, itemId, content, title);
        assertTrue(service.isAlreadyIngested(itemId, content));

        // Second ingestion should skip and not invoke store again
        service.ingestText(userId, itemId, content, title);
        verify(store, org.mockito.Mockito.times(1)).addAll(any(), any());
    }

    @Test
    void testHashCodeCollisionResistance() {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        // "Aa" and "BB" have identical String.hashCode() == 2112 in standard Java
        String content1 = "Aa";
        String content2 = "BB";
        assertEquals(content1.hashCode(), content2.hashCode());

        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        @SuppressWarnings("unchecked")
        EmbeddingStore<TextSegment> store = mock(EmbeddingStore.class);
        dev.langchain4j.model.embedding.EmbeddingModel model =
                mock(dev.langchain4j.model.embedding.EmbeddingModel.class);
        Embedding embedding = Embedding.from(new float[] {1.0f});
        when(provider.getEmbeddingStore()).thenReturn(store);
        when(provider.getEmbeddingModel()).thenReturn(model);
        when(model.embedAll(any()))
                .thenReturn(dev.langchain4j.model.output.Response.from(List.of(embedding)));

        RAGMemoryService service = service(provider);

        // 1. Ingest content1 ("Aa")
        service.ingestText(userId, itemId, content1, "Title 1");
        assertTrue(service.isAlreadyIngested(itemId, content1));
        // Because SHA-256 is used, content2 ("BB") must NOT be considered already ingested
        assertFalse(service.isAlreadyIngested(itemId, content2));

        // 2. Ingest content2 ("BB") for the same itemId (e.g. updated item content)
        service.ingestText(userId, itemId, content2, "Title 2");
        assertTrue(service.isAlreadyIngested(itemId, content2));
        assertFalse(service.isAlreadyIngested(itemId, content1));

        // Verify store.addAll was called twice (once for each distinct content)
        verify(store, org.mockito.Mockito.times(2)).addAll(any(), any());
    }

    @Test
    void testConcurrentIngestionDeduplication() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        String content = "Concurrent shared content payload";
        String title = "Doc Title";

        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        @SuppressWarnings("unchecked")
        EmbeddingStore<TextSegment> store = mock(EmbeddingStore.class);
        dev.langchain4j.model.embedding.EmbeddingModel model =
                mock(dev.langchain4j.model.embedding.EmbeddingModel.class);
        Embedding embedding = Embedding.from(new float[] {1.0f});
        when(provider.getEmbeddingStore()).thenReturn(store);
        when(provider.getEmbeddingModel()).thenReturn(model);
        when(model.embedAll(any()))
                .thenReturn(dev.langchain4j.model.output.Response.from(List.of(embedding)));

        RAGMemoryService service = service(provider);

        int threadCount = 10;
        java.util.concurrent.ExecutorService executor =
                java.util.concurrent.Executors.newFixedThreadPool(threadCount);
        java.util.concurrent.CountDownLatch readyLatch =
                new java.util.concurrent.CountDownLatch(threadCount);
        java.util.concurrent.CountDownLatch startLatch = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch doneLatch =
                new java.util.concurrent.CountDownLatch(threadCount);

        for (int i = 0; i < threadCount; i++) {
            executor.submit(
                    () -> {
                        readyLatch.countDown();
                        try {
                            startLatch.await();
                            service.ingestText(userId, itemId, content, title);
                        } catch (Exception ignored) {
                        } finally {
                            doneLatch.countDown();
                        }
                    });
        }

        readyLatch.await();
        startLatch.countDown(); // Simultaneous release of all 10 threads
        boolean finished = doneLatch.await(5, java.util.concurrent.TimeUnit.SECONDS);
        executor.shutdown();

        assertTrue(finished);
        assertTrue(service.isAlreadyIngested(itemId, content));
        // Exactly one ingestion should have written to the embedding store
        verify(store, org.mockito.Mockito.times(1)).addAll(any(), any());
    }

    private static RAGMemoryService service(EmbeddingStoreProvider provider) {
        return new RAGMemoryService(
                provider, mock(SearchOrchestrator.class), mock(MarkItDownService.class));
    }

    private static EmbeddingMatch<TextSegment> match(
            String text, Metadata metadata, Embedding embedding) {
        return new EmbeddingMatch<>(
                0.9, UUID.randomUUID().toString(), embedding, TextSegment.from(text, metadata));
    }
}
