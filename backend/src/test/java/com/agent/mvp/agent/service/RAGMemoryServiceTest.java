package com.agent.mvp.agent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
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

    @Test
    void ingestTextShouldBeIdempotentForSameItemIdAndContent() {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        String content = "Test content for deduplication";
        String title = "Doc Title";

        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        @SuppressWarnings("unchecked")
        EmbeddingStore<TextSegment> store = mock(EmbeddingStore.class);
        dev.langchain4j.model.embedding.EmbeddingModel model =
                mock(dev.langchain4j.model.embedding.EmbeddingModel.class);
        Embedding embedding = Embedding.from(new float[] {1.0f});
        when(provider.getEmbeddingStore()).thenReturn(store);
        when(provider.getEmbeddingModel()).thenReturn(model);
        when(model.embedAll(any()))
                .thenReturn(dev.langchain4j.model.output.Response.from(List.of(embedding)));

        RAGMemoryService service = service(provider);

        assertFalse(service.isAlreadyIngested(itemId, content));

        // First ingestion
        service.ingestText(userId, itemId, content, title);
        assertTrue(service.isAlreadyIngested(itemId, content));

        // Second ingestion should skip and not invoke store again
        service.ingestText(userId, itemId, content, title);
        verify(store, org.mockito.Mockito.times(1)).addAll(any(), any());
    }

    @Test
    void testHashCodeCollisionResistance() {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        // "Aa" and "BB" have identical String.hashCode() == 2112 in standard Java
        String content1 = "Aa";
        String content2 = "BB";
        assertEquals(content1.hashCode(), content2.hashCode());

        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        @SuppressWarnings("unchecked")
        EmbeddingStore<TextSegment> store = mock(EmbeddingStore.class);
        dev.langchain4j.model.embedding.EmbeddingModel model =
                mock(dev.langchain4j.model.embedding.EmbeddingModel.class);
        Embedding embedding = Embedding.from(new float[] {1.0f});
        when(provider.getEmbeddingStore()).thenReturn(store);
        when(provider.getEmbeddingModel()).thenReturn(model);
        when(model.embedAll(any()))
                .thenReturn(dev.langchain4j.model.output.Response.from(List.of(embedding)));

        RAGMemoryService service = service(provider);

        // 1. Ingest content1 ("Aa")
        service.ingestText(userId, itemId, content1, "Title 1");
        assertTrue(service.isAlreadyIngested(itemId, content1));
        // Because SHA-256 is used, content2 ("BB") must NOT be considered already ingested
        assertFalse(service.isAlreadyIngested(itemId, content2));

        // 2. Ingest content2 ("BB") for the same itemId (e.g. updated item content)
        service.ingestText(userId, itemId, content2, "Title 2");
        assertTrue(service.isAlreadyIngested(itemId, content2));
        assertFalse(service.isAlreadyIngested(itemId, content1));

        // Verify store.addAll was called twice (once for each distinct content)
        verify(store, org.mockito.Mockito.times(2)).addAll(any(), any());
    }

    @Test
    void testConcurrentIngestionDeduplication() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        String content = "Concurrent shared content payload";
        String title = "Doc Title";

        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        @SuppressWarnings("unchecked")
        EmbeddingStore<TextSegment> store = mock(EmbeddingStore.class);
        dev.langchain4j.model.embedding.EmbeddingModel model =
                mock(dev.langchain4j.model.embedding.EmbeddingModel.class);
        Embedding embedding = Embedding.from(new float[] {1.0f});
        when(provider.getEmbeddingStore()).thenReturn(store);
        when(provider.getEmbeddingModel()).thenReturn(model);
        when(model.embedAll(any()))
                .thenReturn(dev.langchain4j.model.output.Response.from(List.of(embedding)));

        RAGMemoryService service = service(provider);

        int threadCount = 10;
        java.util.concurrent.ExecutorService executor =
                java.util.concurrent.Executors.newFixedThreadPool(threadCount);
        java.util.concurrent.CountDownLatch readyLatch =
                new java.util.concurrent.CountDownLatch(threadCount);
        java.util.concurrent.CountDownLatch startLatch = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch doneLatch =
                new java.util.concurrent.CountDownLatch(threadCount);
        java.util.List<Throwable> unexpectedExceptions =
                java.util.Collections.synchronizedList(new java.util.ArrayList<>());

        for (int i = 0; i < threadCount; i++) {
            executor.submit(
                    () -> {
                        readyLatch.countDown();
                        try {
                            startLatch.await();
                            service.ingestText(userId, itemId, content, title);
                        } catch (Throwable t) {
                            unexpectedExceptions.add(t);
                        } finally {
                            doneLatch.countDown();
                        }
                    });
        }

        readyLatch.await();
        startLatch.countDown(); // Simultaneous release of all 10 threads
        boolean finished = doneLatch.await(5, java.util.concurrent.TimeUnit.SECONDS);
        executor.shutdown();

        assertTrue(finished);
        assertTrue(
                unexpectedExceptions.isEmpty(),
                "Unexpected exceptions in threads: " + unexpectedExceptions);
        assertTrue(service.isAlreadyIngested(itemId, content));
        // Exactly one ingestion should have written to the embedding store
        verify(store, org.mockito.Mockito.times(1)).addAll(any(), any());
    }

    @Test
    void testConcurrentIngestionWithFailureAndContentionGuaranteesMutualExclusion()
            throws Exception {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        String content = "Contention payload with failure";
        String title = "Doc Title";

        EmbeddingStoreProvider provider = mock(EmbeddingStoreProvider.class);
        @SuppressWarnings("unchecked")
        EmbeddingStore<TextSegment> store = mock(EmbeddingStore.class);
        dev.langchain4j.model.embedding.EmbeddingModel model =
                mock(dev.langchain4j.model.embedding.EmbeddingModel.class);
        Embedding embedding = Embedding.from(new float[] {1.0f});
        when(provider.getEmbeddingStore()).thenReturn(store);
        when(provider.getEmbeddingModel()).thenReturn(model);
        when(model.embedAll(any()))
                .thenReturn(dev.langchain4j.model.output.Response.from(List.of(embedding)));

        java.util.concurrent.atomic.AtomicInteger activeConcurrentInStore =
                new java.util.concurrent.atomic.AtomicInteger(0);
        java.util.concurrent.atomic.AtomicInteger maxConcurrentInStore =
                new java.util.concurrent.atomic.AtomicInteger(0);
        java.util.concurrent.atomic.AtomicInteger invocationCount =
                new java.util.concurrent.atomic.AtomicInteger(0);

        java.util.concurrent.CountDownLatch aInsideStore =
                new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch letAFail = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch bInsideStore =
                new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch letBFinish = new java.util.concurrent.CountDownLatch(1);

        org.mockito.Mockito.doAnswer(
                        invocation -> {
                            int count = invocationCount.incrementAndGet();
                            int current = activeConcurrentInStore.incrementAndGet();
                            maxConcurrentInStore.accumulateAndGet(current, Math::max);
                            try {
                                if (count == 1) {
                                    aInsideStore.countDown();
                                    boolean awaited =
                                            letAFail.await(
                                                    2, java.util.concurrent.TimeUnit.SECONDS);
                                    if (!awaited) {
                                        throw new RuntimeException("Timeout waiting for letAFail");
                                    }
                                    throw new RuntimeException("Simulated failure for thread A");
                                } else if (count == 2) {
                                    bInsideStore.countDown();
                                    boolean awaited =
                                            letBFinish.await(
                                                    2, java.util.concurrent.TimeUnit.SECONDS);
                                    if (!awaited) {
                                        throw new RuntimeException(
                                                "Timeout waiting for letBFinish");
                                    }
                                    return null;
                                } else {
                                    return null;
                                }
                            } finally {
                                activeConcurrentInStore.decrementAndGet();
                            }
                        })
                .when(store)
                .addAll(any(), any());

        RAGMemoryService service = service(provider);

        java.util.List<Throwable> unexpectedExceptions =
                java.util.Collections.synchronizedList(new java.util.ArrayList<>());
        java.util.concurrent.atomic.AtomicReference<Throwable> threadAException =
                new java.util.concurrent.atomic.AtomicReference<>();

        Thread threadA =
                new Thread(
                        () -> {
                            try {
                                service.ingestText(userId, itemId, content, title);
                            } catch (Throwable t) {
                                threadAException.set(t);
                            }
                        },
                        "Thread-A");

        Thread threadB =
                new Thread(
                        () -> {
                            try {
                                service.ingestText(userId, itemId, content, title);
                            } catch (Throwable t) {
                                unexpectedExceptions.add(t);
                            }
                        },
                        "Thread-B");

        Thread threadC =
                new Thread(
                        () -> {
                            try {
                                service.ingestText(userId, itemId, content, title);
                            } catch (Throwable t) {
                                unexpectedExceptions.add(t);
                            }
                        },
                        "Thread-C");

        // 1. Thread A starts and reaches the store critical section
        try {
            threadA.start();
            assertTrue(aInsideStore.await(2, java.util.concurrent.TimeUnit.SECONDS));

            // 2. Thread B starts while A is inside, deterministic barrier: wait until B transitions
            // to BLOCKED on stripe lock
            threadB.start();
            awaitThreadState(threadB, Thread.State.BLOCKED, 2000);

            // 3. Let Thread A fail and terminate
            letAFail.countDown();
            threadA.join(2000);
            assertFalse(threadA.isAlive(), "Thread A must have terminated cleanly");
            org.junit.jupiter.api.Assertions.assertNotNull(threadAException.get());
            assertTrue(
                    threadAException.get().getCause() != null
                            && threadAException
                                    .get()
                                    .getCause()
                                    .getMessage()
                                    .contains("Simulated failure for thread A"));

            // 4. Thread B now unblocks, acquires the lock, and enters the store critical section
            assertTrue(bInsideStore.await(2, java.util.concurrent.TimeUnit.SECONDS));

            // 5. While Thread B is INSIDE the store critical section, Thread C arrives!
            // Deterministic barrier: wait until C transitions to BLOCKED on the same stripe lock
            threadC.start();
            awaitThreadState(threadC, Thread.State.BLOCKED, 2000);

            // 6. Release Thread B to complete successfully
            letBFinish.countDown();
            threadB.join(2000);
            threadC.join(2000);
            assertFalse(threadB.isAlive(), "Thread B must have terminated cleanly");
            assertFalse(threadC.isAlive(), "Thread C must have terminated cleanly");
        } finally {
            letAFail.countDown();
            letBFinish.countDown();
        }

        // Assertions
        assertTrue(
                unexpectedExceptions.isEmpty(),
                "No unexpected exceptions should be thrown: " + unexpectedExceptions);
        assertEquals(
                1,
                maxConcurrentInStore.get(),
                "Maximum concurrent critical sections for same item must strictly be 1");
        assertEquals(
                2,
                invocationCount.get(),
                "Store should be invoked twice: once for failed A, once for successful B; C must"
                        + " skip");
        assertTrue(service.isAlreadyIngested(itemId, content));
    }

    private static void awaitThreadState(Thread thread, Thread.State expectedState, long timeoutMs)
            throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (thread.getState() != expectedState) {
            if (System.currentTimeMillis() > deadline) {
                throw new AssertionError(
                        "Thread "
                                + thread.getName()
                                + " did not reach "
                                + expectedState
                                + " within "
                                + timeoutMs
                                + "ms, current state: "
                                + thread.getState());
            }
            Thread.sleep(5);
        }
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
