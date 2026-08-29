package com.agent.mvp.agent.search;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.mock;

import com.agent.mvp.config.AppProperties;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

class EmbeddingStoreProviderTest {

    @TempDir Path temporaryDirectory;

    @Test
    void disabledPgVectorUsesInMemoryStore() {
        AppProperties appProperties = new AppProperties();
        appProperties.getPgVector().setEnabled(false);
        EmbeddingStoreProvider provider =
                new EmbeddingStoreProvider(appProperties, mock(JdbcTemplate.class));

        assertInstanceOf(
                InMemoryEmbeddingStore.class,
                provider.createEmbeddingStore("engineering_memory", 384));
    }

    @Test
    void primaryDesktopFallbackUsesPersistentStoreButSemanticCacheRemainsTransient() {
        AppProperties appProperties = new AppProperties();
        appProperties.getPgVector().setEnabled(false);
        appProperties.getLocalVectorStore().setEnabled(true);
        appProperties.getLocalVectorStore().setDirectory(temporaryDirectory.toString());
        EmbeddingStoreProvider provider =
                new EmbeddingStoreProvider(appProperties, mock(JdbcTemplate.class));

        assertInstanceOf(
                PersistentInMemoryEmbeddingStore.class,
                provider.createEmbeddingStore("engineering_memory", 384, true));
        assertInstanceOf(
                InMemoryEmbeddingStore.class, provider.createEmbeddingStore("semantic_cache", 384));
    }
}
