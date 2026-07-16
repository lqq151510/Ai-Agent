package com.agent.mvp.agent.search;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class SearchOrchestratorTest {

    @Test
    void adaptiveFallsBackToFtsWhenVectorReturnsNoResults() {
        SearchConfig config = defaultAdaptiveConfig();
        FakeStrategy vector = new FakeStrategy("VECTOR", true, 0.7, List.of());
        FakeStrategy fts = new FakeStrategy("FTS", true, 0.3, List.of("fts-hit"));
        SearchOrchestrator orchestrator =
                new SearchOrchestrator(List.of(vector, fts), new RRFusioner(60), config);

        List<String> results = orchestrator.search("how to organize notes", 5);

        assertEquals(List.of("fts-hit"), results);
        assertEquals(1, vector.calls());
        assertEquals(1, fts.calls());
    }

    @Test
    void adaptiveUsesAvailableStrategiesWhenNoStrategyMeetsThreshold() {
        SearchConfig config = defaultAdaptiveConfig();
        config.setConfidenceThreshold(0.95);
        FakeStrategy vector = new FakeStrategy("VECTOR", true, 0.7, List.of("vector-hit"));
        FakeStrategy fts = new FakeStrategy("FTS", true, 0.3, List.of("fts-hit"));
        SearchOrchestrator orchestrator =
                new SearchOrchestrator(List.of(vector, fts), new RRFusioner(60), config);

        List<String> results = orchestrator.search("semantic lookup", 5);

        assertEquals(Set.of("vector-hit", "fts-hit"), new HashSet<>(results));
        assertEquals(1, vector.calls());
        assertEquals(1, fts.calls());
    }

    @Test
    void exactLookupUsesHybridSearch() {
        SearchConfig config = defaultAdaptiveConfig();
        FakeStrategy vector = new FakeStrategy("VECTOR", true, 0.7, List.of("vector-hit"));
        FakeStrategy fts = new FakeStrategy("FTS", true, 0.9, List.of("fts-hit"));
        SearchOrchestrator orchestrator =
                new SearchOrchestrator(List.of(vector, fts), new RRFusioner(60), config);

        List<String> results = orchestrator.search("KnowledgeItemService", 5);

        assertEquals(Set.of("vector-hit", "fts-hit"), new HashSet<>(results));
        assertEquals(1, vector.calls());
        assertEquals(1, fts.calls());
    }

    private SearchConfig defaultAdaptiveConfig() {
        SearchConfig config = new SearchConfig();
        config.setDefaultMode(SearchMode.ADAPTIVE);
        config.setConfidenceThreshold(0.5);
        config.setMaxStrategies(2);
        return config;
    }

    private static final class FakeStrategy implements SearchStrategy {
        private final String name;
        private final boolean available;
        private final double confidence;
        private final List<String> results;
        private int calls;

        private FakeStrategy(
                String name, boolean available, double confidence, List<String> results) {
            this.name = name;
            this.available = available;
            this.confidence = confidence;
            this.results = results;
        }

        @Override
        public List<String> search(String query, int maxResults) {
            calls++;
            return results.stream().limit(maxResults).toList();
        }

        @Override
        public boolean isAvailable() {
            return available;
        }

        @Override
        public double getConfidence(String query) {
            return confidence;
        }

        @Override
        public String name() {
            return name;
        }

        private int calls() {
            return calls;
        }
    }
}
