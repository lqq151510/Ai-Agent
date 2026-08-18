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
import java.util.ArrayList;
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

    public RAGMemoryService(
            EmbeddingStoreProvider storeProvider,
            SearchOrchestrator searchOrchestrator,
            MarkItDownService markItDownService) {
        this.storeProvider = storeProvider;
        this.searchOrchestrator = searchOrchestrator;
        this.markItDownService = markItDownService;
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
