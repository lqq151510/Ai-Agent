package com.agent.mvp.agent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.search.EmbeddingStoreProvider;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import org.junit.jupiter.api.Test;

class SemanticCacheServiceTest {

    @Test
    void shouldReusePromptEmbeddingWhenReadingCachedResponse() {
        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        InMemoryEmbeddingStore<TextSegment> store = new InMemoryEmbeddingStore<>();
        Embedding embedding = Embedding.from(new float[] {1.0f, 0.5f, 0.3f});
        when(provider.tryEmbedQuery("explain rag")).thenReturn(embedding);

        SemanticCacheService service = new SemanticCacheService(provider, store);

        service.cacheResponseAsync("  explain   rag  ", "cached answer");
        var cached = service.findCachedResponse("explain rag");

        assertTrue(cached.isPresent());
        assertEquals("cached answer", cached.get());
    }

    @Test
    void shouldShortCircuitEmbeddingAfterProviderFailure() {
        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        InMemoryEmbeddingStore<TextSegment> store = new InMemoryEmbeddingStore<>();
        when(provider.tryEmbedQuery(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(null);

        SemanticCacheService service = new SemanticCacheService(provider, store);

        assertTrue(service.findCachedResponse("first prompt").isEmpty());
        assertTrue(service.findCachedResponse("second prompt").isEmpty());
    }
}
