package com.agent.mvp.agent.search;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PersistentInMemoryEmbeddingStoreTest {

    @TempDir Path temporaryDirectory;

    @Test
    void restoresIndexEntriesAfterCreatingANewStore() throws Exception {
        Path snapshot = temporaryDirectory.resolve("engineering_memory.json");
        Embedding embedding = Embedding.from(new float[] {1.0f, 0.0f});
        PersistentInMemoryEmbeddingStore first = new PersistentInMemoryEmbeddingStore(snapshot);

        first.add(embedding, TextSegment.from("persistent local retrieval entry"));

        assertTrue(Files.size(snapshot) > 0);
        PersistentInMemoryEmbeddingStore restored = new PersistentInMemoryEmbeddingStore(snapshot);
        var matches = restored.search(
                EmbeddingSearchRequest.builder().queryEmbedding(embedding).maxResults(1).build()).matches();

        assertEquals(1, matches.size());
        assertEquals("persistent local retrieval entry", matches.get(0).embedded().text());
    }

    @Test
    void preservesMalformedSnapshotAndRecoversWithAnEmptyIndex() throws Exception {
        Path snapshot = temporaryDirectory.resolve("engineering_memory.json");
        Files.writeString(snapshot, "not valid embedding-store json");

        PersistentInMemoryEmbeddingStore restored = new PersistentInMemoryEmbeddingStore(snapshot);
        var matches = restored.search(
                EmbeddingSearchRequest.builder()
                        .queryEmbedding(Embedding.from(new float[] {1.0f, 0.0f}))
                        .maxResults(1)
                        .build())
                .matches();

        assertTrue(matches.isEmpty());
        assertFalse(Files.exists(snapshot));
        try (Stream<Path> files = Files.list(temporaryDirectory)) {
            assertTrue(
                    files.anyMatch(path -> path.getFileName().toString().startsWith("engineering_memory.json.corrupt-")));
        }
    }
}
