package com.agent.mvp.agent.service;

import static com.agent.mvp.agent.search.SearchQueryUtils.normalizeMaxResults;
import static com.agent.mvp.agent.search.SearchQueryUtils.normalizeQuery;

import com.agent.mvp.agent.search.EmbeddingStoreProvider;
import com.agent.mvp.agent.search.SearchOrchestrator;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.DocumentSplitter;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.document.splitter.DocumentSplitters;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.output.Response;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingSearchRequest;
import dev.langchain4j.store.embedding.EmbeddingStore;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class RAGMemoryService {
    private static final Logger log = LoggerFactory.getLogger(RAGMemoryService.class);

    private final EmbeddingStoreProvider storeProvider;
    private final SearchOrchestrator searchOrchestrator;
    private final MarkItDownService markItDownService;
    private final com.github.benmanes.caffeine.cache.Cache<UUID, String> ingestedItemContentHashes =
            com.github.benmanes.caffeine.cache.Caffeine.newBuilder()
                    .maximumSize(10_000)
                    .expireAfterWrite(java.time.Duration.ofHours(24))
                    .build();
    private static final int STRIPE_COUNT = 128;
    private final Object[] stripeLocks;

    private static String sha256(String text) {
        if (text == null) {
            return "";
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", ex);
        }
    }

    public RAGMemoryService(
            EmbeddingStoreProvider storeProvider,
            SearchOrchestrator searchOrchestrator,
            MarkItDownService markItDownService) {
        this.storeProvider = storeProvider;
        this.searchOrchestrator = searchOrchestrator;
        this.markItDownService = markItDownService;
        this.stripeLocks = new Object[STRIPE_COUNT];
        for (int i = 0; i < STRIPE_COUNT; i++) {
            this.stripeLocks[i] = new Object();
        }
    }

    private Object getStripeLock(UUID itemId) {
        if (itemId == null) {
            return this;
        }
        int hash = itemId.hashCode();
        hash = hash ^ (hash >>> 16);
        return stripeLocks[Math.abs(hash % STRIPE_COUNT)];
    }

    public boolean isAlreadyIngested(UUID itemId, String text) {
        if (itemId == null || text == null) {
            return false;
        }
        String existingHash = ingestedItemContentHashes.getIfPresent(itemId);
        if (existingHash == null) {
            return false;
        }
        String currentHash = sha256(text);
        return existingHash.equals(currentHash);
    }

    /** 将诊断记录添加到向量数据库中 */
    public void storeDiagnosis(
            UUID userId, UUID runId, String symptom, String rootCause, String minimalFix) {
        try {
            String text =
                    String.format(
                            "Symptom: %s\nRoot Cause: %s\nMinimal Fix: %s",
                            symptom, rootCause, minimalFix);
            TextSegment segment =
                    TextSegment.from(
                            text,
                            Metadata.from(
                                    java.util.Map.of(
                                            "userId",
                                            userId.toString(),
                                            "runId",
                                            runId.toString())));
            EmbeddingModel embeddingModel = storeProvider.getEmbeddingModel();
            EmbeddingStore<TextSegment> embeddingStore = storeProvider.getEmbeddingStore();
            Embedding embedding = embeddingModel.embed(segment).content();
            embeddingStore.add(embedding, segment);
            log.info("Stored diagnosis vector for runId: {} in embedding store", runId);
        } catch (Exception ex) {
            log.error("Failed to store diagnosis vector. Non-blocking error: {}", ex.getMessage());
        }
    }

    /** 根据当前消息/症状检索相似的历史诊断记录（基于 Pre-filtering 租户隔离） */
    public List<String> searchSimilarDiagnoses(UUID userId, String queryText, int maxResults) {
        List<String> results = new ArrayList<>();
        String normalizedQuery = normalizeQuery(queryText);
        int safeMaxResults = normalizeMaxResults(maxResults);
        if (userId == null || normalizedQuery.isBlank()) {
            return results;
        }
        try {
            Embedding queryEmbedding = storeProvider.tryEmbedQuery(normalizedQuery);
            if (queryEmbedding == null) {
                return results;
            }
            dev.langchain4j.store.embedding.filter.Filter userFilter =
                    dev.langchain4j.store.embedding.filter.MetadataFilterBuilder.metadataKey(
                                    "userId")
                            .isEqualTo(userId.toString());
            EmbeddingStore<TextSegment> embeddingStore = storeProvider.getEmbeddingStore();
            EmbeddingSearchRequest request =
                    EmbeddingSearchRequest.builder()
                            .queryEmbedding(queryEmbedding)
                            .filter(userFilter)
                            .maxResults(safeMaxResults)
                            .build();
            List<EmbeddingMatch<TextSegment>> matches = embeddingStore.search(request).matches();
            if (matches != null) {
                for (EmbeddingMatch<TextSegment> match : matches) {
                    results.add(match.embedded().text());
                    if (results.size() >= safeMaxResults) {
                        break;
                    }
                }
            }
        } catch (Exception ex) {
            log.error(
                    "Failed to search similar diagnoses from vector store. Error: {}",
                    ex.getMessage());
        }
        return results;
    }

    /** 搜索代码上下文，委托给 {@link SearchOrchestrator} 根据配置的搜索模式执行策略编排和结果融合。 */
    public List<String> searchCodeContext(String queryText, int maxResults) {
        return searchOrchestrator.search(queryText, maxResults);
    }

    @Async
    public void ingestDocument(File documentFile) {
        try {
            log.info("Starting ingestion of document: {}", documentFile.getName());
            String markdown = markItDownService.convertDocumentToMarkdown(documentFile);

            Document document =
                    Document.from(markdown, Metadata.from("filename", documentFile.getName()));
            DocumentSplitter splitter = DocumentSplitters.recursive(1000, 100);
            List<TextSegment> segments = splitter.split(document);

            if (!segments.isEmpty()) {
                EmbeddingModel embeddingModel = storeProvider.getEmbeddingModel();
                EmbeddingStore<TextSegment> embeddingStore = storeProvider.getEmbeddingStore();
                Response<List<Embedding>> embeddingResponse = embeddingModel.embedAll(segments);
                embeddingStore.addAll(embeddingResponse.content(), segments);
            }
            log.info(
                    "Successfully ingested document: {} with {} segments",
                    documentFile.getName(),
                    segments.size());
        } catch (Exception ex) {
            log.error(
                    "Failed to ingest document {}. Error: {}",
                    documentFile.getName(),
                    ex.getMessage());
            throw new RuntimeException("Document ingestion failed", ex);
        }
    }

    public void ingestDocuments(List<Document> documents) {
        try {
            log.info("Starting ingestion of {} code documents", documents.size());
            DocumentSplitter splitter = DocumentSplitters.recursive(1000, 100);
            List<TextSegment> allSegments = new ArrayList<>();
            for (Document doc : documents) {
                allSegments.addAll(splitter.split(doc));
            }
            if (!allSegments.isEmpty()) {
                EmbeddingModel embeddingModel = storeProvider.getEmbeddingModel();
                EmbeddingStore<TextSegment> embeddingStore = storeProvider.getEmbeddingStore();
                Response<List<Embedding>> embeddingResponse = embeddingModel.embedAll(allSegments);
                embeddingStore.addAll(embeddingResponse.content(), allSegments);
            }
            log.info("Successfully ingested {} code segments", allSegments.size());
        } catch (Exception ex) {
            log.error("Failed to ingest code documents. Error: {}", ex.getMessage());
            throw new RuntimeException("Code document ingestion failed", ex);
        }
    }

    /** 针对单段文本（来自异步消息或知识项）执行切片、向量嵌入并存储至向量数据库。具备幂等防重与并发协调保障。 */
    public void ingestText(UUID userId, UUID itemId, String text, String title) {
        if (text == null || text.isBlank()) {
            return;
        }
        String textHash = sha256(text);
        if (itemId == null) {
            doIngest(userId, null, text, title);
            return;
        }

        // 1. 快速检查（Fast path）：若缓存中已存在该 itemId 且内容摘要一致，直接返回
        if (textHash.equals(ingestedItemContentHashes.getIfPresent(itemId))) {
            log.info(
                    "Item {} with identical content already ingested into vector store, skipping"
                            + " duplicate ingestion.",
                    itemId);
            return;
        }

        // 2. 进程内生命周期稳定的条带互斥锁（Striped Lock），规避动态锁生命周期过早释放引起的锁分裂竞态
        Object lock = getStripeLock(itemId);
        synchronized (lock) {
            // 3. 双重检查锁定（Double-Checked Locking）：获取锁后再次校验是否已由并发前序线程完成摄取
            if (textHash.equals(ingestedItemContentHashes.getIfPresent(itemId))) {
                log.info(
                        "Item {} with identical content was just ingested by concurrent thread,"
                                + " skipping duplicate ingestion.",
                        itemId);
                return;
            }
            doIngest(userId, itemId, text, title);
            ingestedItemContentHashes.put(itemId, textHash);
        }
    }

    private void doIngest(UUID userId, UUID itemId, String text, String title) {
        try {
            java.util.Map<String, String> metadataMap = new java.util.HashMap<>();
            if (userId != null) {
                metadataMap.put("userId", userId.toString());
            }
            if (itemId != null) {
                metadataMap.put("itemId", itemId.toString());
            }
            if (title != null) {
                metadataMap.put("title", title);
            }
            Document document = Document.from(text, Metadata.from(metadataMap));
            DocumentSplitter splitter = DocumentSplitters.recursive(1000, 100);
            List<TextSegment> segments = splitter.split(document);
            if (!segments.isEmpty()) {
                EmbeddingModel embeddingModel = storeProvider.getEmbeddingModel();
                EmbeddingStore<TextSegment> embeddingStore = storeProvider.getEmbeddingStore();
                Response<List<Embedding>> embeddingResponse = embeddingModel.embedAll(segments);
                embeddingStore.addAll(embeddingResponse.content(), segments);
            }
            log.info(
                    "Successfully ingested text for item {} with {} segments",
                    itemId,
                    segments.size());
        } catch (Exception ex) {
            log.error("Failed to ingest text for item {}. Error: {}", itemId, ex.getMessage(), ex);
            throw new RuntimeException("Text ingestion failed", ex);
        }
    }

    /** 列出用户的记忆片段（如果是 pgvector 存储） */
    public List<Map<String, Object>> listAllMemories(UUID userId) {
        List<Map<String, Object>> list = new ArrayList<>();
        try {
            JdbcTemplate jdbcTemplate = storeProvider.getJdbcTemplate();
            String sql =
                    "SELECT embedding_id, text, metadata::text AS metadata FROM engineering_memory "
                            + "WHERE metadata::jsonb ->> 'userId' = ?";
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, userId.toString());
            for (Map<String, Object> row : rows) {
                String id = String.valueOf(row.get("embedding_id"));
                String text = (String) row.get("text");
                Object metadata = row.get("metadata");
                String metadataStr = metadata == null ? null : metadata.toString();
                list.add(
                        Map.of(
                                "id", id,
                                "text", text != null ? text : "",
                                "metadata", metadataStr != null ? metadataStr : "{}"));
            }
        } catch (Exception ex) {
            log.warn(
                    "Failed to list memories from pgvector, database table may not be initialized:"
                            + " {}",
                    ex.getMessage());
        }
        return list;
    }

    /** 更新特定记忆片段的内容，并重新计算嵌入向量存回 DB */
    public void updateMemory(String id, String text, UUID userId) {
        try {
            EmbeddingModel embeddingModel = storeProvider.getEmbeddingModel();
            JdbcTemplate jdbcTemplate = storeProvider.getJdbcTemplate();

            TextSegment segment = TextSegment.from(text);
            Embedding newEmbedding = embeddingModel.embed(segment).content();
            float[] vector = newEmbedding.vector();

            StringBuilder sb = new StringBuilder();
            sb.append("[");
            for (int i = 0; i < vector.length; i++) {
                sb.append(vector[i]);
                if (i < vector.length - 1) {
                    sb.append(",");
                }
            }
            sb.append("]");

            String sql =
                    "UPDATE engineering_memory SET text = ?, embedding = ?::vector WHERE"
                            + " embedding_id = ?::uuid AND metadata::jsonb ->> 'userId' = ?";
            int affected = jdbcTemplate.update(sql, text, sb.toString(), id, userId.toString());
            if (affected == 0) {
                throw new RuntimeException("Memory not found or not owned by user: " + id);
            }
            log.info("Successfully updated memory embedding for id: {}", id);
        } catch (Exception ex) {
            log.error("Failed to update memory. Error: {}", ex.getMessage());
            throw new RuntimeException("Failed to update memory", ex);
        }
    }

    /** 从向量库中删除特定记忆片段 */
    public void deleteMemory(String id, UUID userId) {
        try {
            JdbcTemplate jdbcTemplate = storeProvider.getJdbcTemplate();
            String sql =
                    "DELETE FROM engineering_memory WHERE embedding_id = ?::uuid AND"
                            + " metadata::jsonb ->> 'userId' = ?";
            int affected = jdbcTemplate.update(sql, id, userId.toString());
            if (affected == 0) {
                throw new RuntimeException("Memory not found or not owned by user: " + id);
            }
            log.info("Successfully deleted memory for id: {}", id);
        } catch (Exception ex) {
            log.error("Failed to delete memory. Error: {}", ex.getMessage());
            throw new RuntimeException("Failed to delete memory", ex);
        }
    }
}
