package com.agent.mvp.agent.search;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingStore;
import org.junit.jupiter.api.Test;

class SearchStrategyConfigTest {

    @Test
    void ftsAvailabilityHonorsConfigSwitch() {
        EmbeddingStoreProvider storeProvider = mock(EmbeddingStoreProvider.class);
        SearchConfig config = new SearchConfig();
        when(storeProvider.isFtsAvailable()).thenReturn(true);

        FtsSearchStrategy strategy = new FtsSearchStrategy(storeProvider, config);

        assertTrue(strategy.isAvailable());

        config.getStrategies().getFts().setEnabled(false);

        assertFalse(strategy.isAvailable());
    }

    @Test
    void vectorAvailabilityHonorsConfigSwitch() {
        EmbeddingStoreProvider storeProvider = mock(EmbeddingStoreProvider.class);
        @SuppressWarnings("unchecked")
        EmbeddingStore<TextSegment> embeddingStore = mock(EmbeddingStore.class);
        SearchConfig config = new SearchConfig();
        when(storeProvider.getEmbeddingStore()).thenReturn(embeddingStore);

        VectorSearchStrategy strategy = new VectorSearchStrategy(storeProvider, config);

        assertTrue(strategy.isAvailable());

        config.getStrategies().getVector().setEnabled(false);

        assertFalse(strategy.isAvailable());
    }

    @Test
    void confidenceHonorsStrategyWeight() {
        EmbeddingStoreProvider storeProvider = mock(EmbeddingStoreProvider.class);
        SearchConfig config = new SearchConfig();
        config.getStrategies().getFts().setWeight(0.5);
        config.getStrategies().getVector().setWeight(0.25);

        FtsSearchStrategy fts = new FtsSearchStrategy(storeProvider, config);
        VectorSearchStrategy vector = new VectorSearchStrategy(storeProvider, config);

        assertEquals(0.45, fts.getConfidence("KnowledgeItemService"), 0.001);
        assertEquals(0.175, vector.getConfidence("semantic lookup"), 0.001);
    }
}
