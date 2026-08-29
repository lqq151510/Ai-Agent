package com.agent.mvp.agent.search;

import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingSearchResult;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.filter.Filter;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Collection;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * File-backed fallback for the desktop vector index.
 *
 * <p>The store keeps LangChain4j's in-memory search behavior while writing a complete JSON snapshot
 * atomically after mutations. A malformed snapshot is preserved as a diagnostic artifact and
 * replaced by an empty in-memory index so the desktop backend can still start.
 */
final class PersistentInMemoryEmbeddingStore implements EmbeddingStore<TextSegment> {

    private static final Logger log =
            LoggerFactory.getLogger(PersistentInMemoryEmbeddingStore.class);

    private final Path storeFile;
    private InMemoryEmbeddingStore<TextSegment> delegate;

    PersistentInMemoryEmbeddingStore(Path storeFile) {
        this.storeFile = storeFile;
        this.delegate = restore(storeFile);
    }

    @Override
    public synchronized String add(Embedding embedding) {
        String id = delegate.add(embedding);
        persist();
        return id;
    }

    @Override
    public synchronized void add(String id, Embedding embedding) {
        delegate.add(id, embedding);
        persist();
    }

    @Override
    public synchronized String add(Embedding embedding, TextSegment embedded) {
        String id = delegate.add(embedding, embedded);
        persist();
        return id;
    }

    @Override
    public synchronized List<String> addAll(List<Embedding> embeddings) {
        List<String> ids = delegate.addAll(embeddings);
        persist();
        return ids;
    }

    @Override
    public synchronized List<String> addAll(
            List<Embedding> embeddings, List<TextSegment> embedded) {
        List<String> ids = delegate.addAll(embeddings, embedded);
        persist();
        return ids;
    }

    @Override
    public synchronized void remove(String id) {
        delegate.remove(id);
        persist();
    }

    @Override
    public synchronized void removeAll(Collection<String> ids) {
        delegate.removeAll(ids);
        persist();
    }

    @Override
    public synchronized void removeAll(Filter filter) {
        delegate.removeAll(filter);
        persist();
    }

    @Override
    public synchronized void removeAll() {
        delegate.removeAll();
        persist();
    }

    @Override
    public synchronized EmbeddingSearchResult<TextSegment> search(EmbeddingSearchRequest request) {
        return delegate.search(request);
    }

    private InMemoryEmbeddingStore<TextSegment> restore(Path path) {
        if (!Files.isRegularFile(path)) {
            return new InMemoryEmbeddingStore<>();
        }
        try {
            return InMemoryEmbeddingStore.fromFile(path);
        } catch (RuntimeException ex) {
            preserveCorruptSnapshot(path, ex);
            return new InMemoryEmbeddingStore<>();
        }
    }

    private void preserveCorruptSnapshot(Path path, RuntimeException cause) {
        Path backup =
                path.resolveSibling(path.getFileName() + ".corrupt-" + System.currentTimeMillis());
        try {
            Files.move(path, backup, StandardCopyOption.REPLACE_EXISTING);
            log.warn(
                    "Recovered desktop vector index from malformed snapshot; preserved corrupt file"
                            + " at {}. Cause: {}",
                    backup,
                    cause.getMessage());
        } catch (IOException moveFailure) {
            log.warn(
                    "Failed to read desktop vector index at {} and could not preserve it. Cause:"
                            + " {}",
                    path,
                    moveFailure.getMessage());
        }
    }

    private void persist() {
        Path parent = storeFile.getParent();
        if (parent == null) {
            log.warn("Desktop vector index path has no parent directory: {}", storeFile);
            return;
        }

        Path temporaryFile = null;
        try {
            Files.createDirectories(parent);
            temporaryFile =
                    Files.createTempFile(parent, storeFile.getFileName().toString(), ".tmp");
            delegate.serializeToFile(temporaryFile);
            moveSnapshot(temporaryFile, storeFile);
            temporaryFile = null;
        } catch (IOException | RuntimeException ex) {
            log.warn(
                    "Desktop vector index mutation remains in memory because snapshot persistence"
                            + " failed at {}. Cause: {}",
                    storeFile,
                    ex.getMessage());
        } finally {
            if (temporaryFile != null) {
                try {
                    Files.deleteIfExists(temporaryFile);
                } catch (IOException ignored) {
                    log.debug(
                            "Could not remove temporary desktop vector index snapshot: {}",
                            temporaryFile);
                }
            }
        }
    }

    private void moveSnapshot(Path source, Path target) throws IOException {
        try {
            Files.move(
                    source,
                    target,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
