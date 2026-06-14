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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class RAGMemoryService {
    private static final Logger log = LoggerFactory.getLogger(RAGMemoryService.class);

    private final AppProperties appProperties;
    private final EmbeddingModel embeddingModel;
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

    public RAGMemoryService(AppProperties appProperties, MarkItDownService markItDownService) {
        this.appProperties = appProperties;
        this.markItDownService = markItDownService;
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
        List<String> results = new ArrayList<>();
        try {
            Embedding queryEmbedding = embeddingModel.embed(queryText).content();
            List<EmbeddingMatch<TextSegment>> matches =
                    embeddingStore.findRelevant(queryEmbedding, maxResults);
            for (EmbeddingMatch<TextSegment> match : matches) {
                // Return all matches since code context doesn't have a userId
                results.add(match.embedded().text());
            }
        } catch (Exception ex) {
            log.error("Failed to search code context from vector store. Error: {}", ex.getMessage());
        }
        return results;
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
}
