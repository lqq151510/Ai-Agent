package com.agent.mvp.agent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.config.AppProperties;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.output.Response;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class SemanticCacheServiceTest {

    @Test
    void shouldReusePromptEmbeddingWhenReadingCachedResponse() {
        CountingEmbeddingModel embeddingModel = new CountingEmbeddingModel(false);
        SemanticCacheService service =
                new SemanticCacheService(
                        new AppProperties(), embeddingModel, new InMemoryEmbeddingStore<>());

        service.cacheResponseAsync("  explain   rag  ", "cached answer");
        var cached = service.findCachedResponse("explain rag");

        assertTrue(cached.isPresent());
        assertEquals("cached answer", cached.get());
        assertEquals(1, embeddingModel.callCount());
    }

    @Test
    void shouldShortCircuitEmbeddingAfterProviderFailure() {
        CountingEmbeddingModel embeddingModel = new CountingEmbeddingModel(true);
        SemanticCacheService service =
                new SemanticCacheService(
                        new AppProperties(), embeddingModel, new InMemoryEmbeddingStore<>());

        assertTrue(service.findCachedResponse("first prompt").isEmpty());
        assertTrue(service.findCachedResponse("second prompt").isEmpty());

        assertEquals(1, embeddingModel.callCount());
    }

    private static final class CountingEmbeddingModel implements EmbeddingModel {
        private final AtomicInteger callCount = new AtomicInteger();
        private final boolean fail;

        private CountingEmbeddingModel(boolean fail) {
            this.fail = fail;
        }

        @Override
        public Response<List<Embedding>> embedAll(List<TextSegment> textSegments) {
            callCount.addAndGet(textSegments.size());
            if (fail) {
                throw new RuntimeException("embedding offline");
            }
            return Response.from(
                    textSegments.stream().map(segment -> embeddingFor(segment.text())).toList());
        }

        private int callCount() {
            return callCount.get();
        }

        private Embedding embeddingFor(String text) {
            int hash = text == null ? 0 : text.hashCode();
            return Embedding.from(new float[] {1.0f, (hash % 31) / 31.0f, (hash % 17) / 17.0f});
        }
    }
}
