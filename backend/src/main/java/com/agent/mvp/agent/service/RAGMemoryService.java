package com.agent.mvp.agent.service;

import com.agent.mvp.config.AppProperties;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.DocumentSplitter;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.document.splitter.DocumentSplitters;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.output.Response;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import dev.langchain4j.store.embedding.pgvector.PgVectorEmbeddingStore;
import jakarta.annotation.PostConstruct;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.Map;
import java.util.HashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class RAGMemoryService {
    private static final Logger log = LoggerFactory.getLogger(RAGMemoryService.class);

    private final AppProperties appProperties;
    private final EmbeddingModel embeddingModel;
    private final JdbcTemplate jdbcTemplate;
    private EmbeddingStore<TextSegment> embeddingStore;

    @Value("${PG_HOST:localhost}")
    private String pgHost;

    @Value("${PG_PORT:5432}")
    private int pgPort;

    @Value("${PG_DATABASE:ai_agent}")
    private String pgDatabase;

    @Value("${PG_USERNAME:postgres}")
    private String pgUsername;

    @Value("${PG_PASSWORD:change-me}")
    private String pgPassword;

    private final MarkItDownService markItDownService;

    public RAGMemoryService(AppProperties appProperties, MarkItDownService markItDownService, JdbcTemplate jdbcTemplate) {
        this.appProperties = appProperties;
        this.markItDownService = markItDownService;
        this.jdbcTemplate = jdbcTemplate;
        this.embeddingModel =
                dev.langchain4j.model.openai.OpenAiEmbeddingModel.builder()
                        .apiKey(
                                appProperties.getOpenai().getApiKey() != null
                                                && !appProperties.getOpenai().getApiKey().isBlank()
                                        ? appProperties.getOpenai().getApiKey()
                                        : "demo")
                        .baseUrl(appProperties.getOpenai().getBaseUrl())
                        .modelName("text-embedding-3-small")
                        .dimensions(384)
                        .build();
    }

    @PostConstruct
    public void init() {
        try {
            log.info(
                    "Initializing PgVectorEmbeddingStore with host: {}, port: {}",
                    pgHost,
                    pgPort);
            this.embeddingStore =
                    PgVectorEmbeddingStore.builder()
                            .host(pgHost)
                            .port(pgPort)
                            .database(pgDatabase)
                            .user(pgUsername)
                            .password(pgPassword)
                            .table("engineering_memory")
                            .dimension(384)
                            .build();
            log.info("PgVectorEmbeddingStore initialized successfully.");
        } catch (Exception ex) {
            log.warn(
                    "Failed to initialize PgVectorEmbeddingStore. Falling back to"
                            + " InMemoryEmbeddingStore. Error: {}",
                    ex.getMessage());
            this.embeddingStore = new InMemoryEmbeddingStore<>();
        }
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
            Embedding embedding = embeddingModel.embed(segment).content();
            embeddingStore.add(embedding, segment);
            log.info("Stored diagnosis vector for runId: {} in embedding store", runId);
        } catch (Exception ex) {
            log.error("Failed to store diagnosis vector. Non-blocking error: {}", ex.getMessage());
        }
    }

    /** 根据当前消息/症状检索相似的历史诊断记录 */
    public List<String> searchSimilarDiagnoses(UUID userId, String queryText, int maxResults) {
        List<String> results = new ArrayList<>();
        try {
            Embedding queryEmbedding = embeddingModel.embed(queryText).content();
            List<EmbeddingMatch<TextSegment>> matches =
                    embeddingStore.findRelevant(queryEmbedding, maxResults);
            for (EmbeddingMatch<TextSegment> match : matches) {
                String matchUserId = match.embedded().metadata().getString("userId");
                if (matchUserId == null || matchUserId.equals(userId.toString())) {
                    results.add(match.embedded().text());
                }
            }
        } catch (Exception ex) {
            log.error(
                    "Failed to search similar diagnoses from vector store. Error: {}",
                    ex.getMessage());
        }
        return results;
    }

    public List<String> searchCodeContext(String queryText, int maxResults) {
        List<String> vectorResults = searchCodeContextVector(queryText, maxResults * 2);
        List<String> ftsResults = searchCodeContextFTS(queryText, maxResults * 2);
        return rrfCombine(vectorResults, ftsResults, maxResults);
    }

    private List<String> searchCodeContextVector(String queryText, int maxResults) {
        List<String> results = new ArrayList<>();
        try {
            Embedding queryEmbedding = embeddingModel.embed(queryText).content();
            List<EmbeddingMatch<TextSegment>> matches =
                    embeddingStore.findRelevant(queryEmbedding, maxResults);
            for (EmbeddingMatch<TextSegment> match : matches) {
                results.add(match.embedded().text());
            }
        } catch (Exception ex) {
            log.error("Failed to search code context from vector store. Error: {}", ex.getMessage());
        }
        return results;
    }

    public List<String> searchCodeContextFTS(String queryText, int maxResults) {
        List<String> results = new ArrayList<>();
        try {
            String likePattern = "%" + queryText + "%";
            String sql = "SELECT text FROM engineering_memory " +
                         "WHERE to_tsvector('english', COALESCE(text, '')) @@ plainto_tsquery('english', ?) " +
                         "   OR text ILIKE ? " +
                         "LIMIT ?";
            results = jdbcTemplate.query(sql, (rs, rowNum) -> rs.getString("text"), queryText, likePattern, maxResults);
            log.info("FTS search returned {} results for query: {}", results.size(), queryText);
        } catch (Exception e) {
            log.warn("Failed to perform FTS search. Falling back. Error: {}", e.getMessage());
        }
        return results;
    }

    private List<String> rrfCombine(List<String> vectorList, List<String> ftsList, int maxResults) {
        Map<String, Double> rrfScores = new HashMap<>();
        int k = 60;

        for (int i = 0; i < vectorList.size(); i++) {
            String doc = vectorList.get(i);
            double score = 1.0 / (k + (i + 1));
            rrfScores.put(doc, rrfScores.getOrDefault(doc, 0.0) + score);
        }

        for (int i = 0; i < ftsList.size(); i++) {
            String doc = ftsList.get(i);
            double score = 1.0 / (k + (i + 1));
            rrfScores.put(doc, rrfScores.getOrDefault(doc, 0.0) + score);
        }

        List<Map.Entry<String, Double>> sorted = new ArrayList<>(rrfScores.entrySet());
        sorted.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));

        List<String> finalResults = new ArrayList<>();
        for (int i = 0; i < Math.min(maxResults, sorted.size()); i++) {
            finalResults.add(sorted.get(i).getKey());
        }
        return finalResults;
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
    public List<java.util.Map<String, Object>> listAllMemories(UUID userId) {
        List<java.util.Map<String, Object>> list = new ArrayList<>();
        try {
            String sql = "SELECT embedding_id, text, metadata FROM engineering_memory";
            List<java.util.Map<String, Object>> rows = jdbcTemplate.queryForList(sql);
            for (java.util.Map<String, Object> row : rows) {
                String id = String.valueOf(row.get("embedding_id"));
                String text = (String) row.get("text");
                String metadataStr = (String) row.get("metadata");

                boolean matches = true;
                if (metadataStr != null) {
                    // 如果元数据里包含 userId，则做基于 userId 的隔离过滤
                    if (metadataStr.contains("\"userId\"")) {
                        matches = metadataStr.contains(userId.toString());
                    }
                }
                if (matches) {
                    list.add(java.util.Map.of(
                        "id", id,
                        "text", text != null ? text : "",
                        "metadata", metadataStr != null ? metadataStr : "{}"
                    ));
                }
            }
        } catch (Exception ex) {
            log.warn("Failed to list memories from pgvector, database table may not be initialized: {}", ex.getMessage());
        }
        return list;
    }

    /** 更新特定记忆片段的内容，并重新计算嵌入向量存回 DB */
    public void updateMemory(String id, String text) {
        try {
            // 1. 调用 embedding model 计算新文本的向量
            TextSegment segment = TextSegment.from(text);
            Embedding newEmbedding = embeddingModel.embed(segment).content();
            float[] vector = newEmbedding.vector();

            // 2. 将 float[] 转换为 pgvector 接受的 [v1, v2, ...] 格式字符串
            StringBuilder sb = new StringBuilder();
            sb.append("[");
            for (int i = 0; i < vector.length; i++) {
                sb.append(vector[i]);
                if (i < vector.length - 1) {
                    sb.append(",");
                }
            }
            sb.append("]");

            // 3. 更新数据库记录
            String sql = "UPDATE engineering_memory SET text = ?, embedding = ?::vector WHERE embedding_id = ?::uuid";
            jdbcTemplate.update(sql, text, sb.toString(), id);
            log.info("Successfully updated memory embedding for id: {}", id);
        } catch (Exception ex) {
            log.error("Failed to update memory. Error: {}", ex.getMessage());
            throw new RuntimeException("Failed to update memory", ex);
        }
    }

    /** 从向量库中删除特定记忆片段 */
    public void deleteMemory(String id) {
        try {
            String sql = "DELETE FROM engineering_memory WHERE embedding_id = ?::uuid";
            jdbcTemplate.update(sql, id);
            log.info("Successfully deleted memory for id: {}", id);
        } catch (Exception ex) {
            log.error("Failed to delete memory. Error: {}", ex.getMessage());
            throw new RuntimeException("Failed to delete memory", ex);
        }
    }
}
