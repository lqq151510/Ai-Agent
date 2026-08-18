package com.agent.mvp.agent.search;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.mock;

import com.agent.mvp.config.AppProperties;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class EmbeddingStoreProviderTest {

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
}
