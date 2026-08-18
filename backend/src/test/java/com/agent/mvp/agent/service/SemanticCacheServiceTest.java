package com.agent.mvp.agent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.search.EmbeddingStoreProvider;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SemanticCacheServiceTest {

    @Test
    void shouldReusePromptEmbeddingOnlyForTheOwningUser() {
        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        InMemoryEmbeddingStore<TextSegment> store = new InMemoryEmbeddingStore<>();
        Embedding embedding = Embedding.from(new float[] {1.0f});
        when(provider.tryEmbedQuery("explain rag")).thenReturn(embedding);

        SemanticCacheService service = new SemanticCacheService(provider, store);
        UUID ownerId = UUID.randomUUID();
        service.cacheResponseAsync(ownerId, " explain rag ", "cached answer");

        var cached = service.findCachedResponse(ownerId, "explain rag");

        assertTrue(cached.isPresent());
        assertEquals("cached answer", cached.get());
        assertTrue(service.findCachedResponse(UUID.randomUUID(), "explain rag").isEmpty());
        assertTrue(service.findCachedResponse("explain rag").isEmpty());
    }

    @Test
    void shouldShortCircuitEmbeddingAfterProviderFailure() {
        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        InMemoryEmbeddingStore<TextSegment> store = new InMemoryEmbeddingStore<>();
        when(provider.tryEmbedQuery(org.mockito.ArgumentMatchers.anyString())).thenReturn(null);

        SemanticCacheService service = new SemanticCacheService(provider, store);
        UUID userId = UUID.randomUUID();

        assertTrue(service.findCachedResponse(userId, "first prompt").isEmpty());
        assertTrue(service.findCachedResponse(userId, "second prompt").isEmpty());
    }
}
