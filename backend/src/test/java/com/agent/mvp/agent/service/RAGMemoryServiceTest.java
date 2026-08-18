package com.agent.mvp.agent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
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
