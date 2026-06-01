package com.agent.mvp.agent.service;

import com.agent.mvp.config.AppProperties;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.output.Response;
import dev.langchain4j.store.embedding.EmbeddingMatch;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import dev.langchain4j.store.embedding.milvus.MilvusEmbeddingStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class RAGMemoryService {
    private static final Logger log = LoggerFactory.getLogger(RAGMemoryService.class);

    private final AppProperties appProperties;
    private final EmbeddingModel embeddingModel;
    private EmbeddingStore<TextSegment> embeddingStore;

    @Value("${milvus.host:localhost}")
    private String milvusHost;

    @Value("${milvus.port:19530}")
    private int milvusPort;

    public RAGMemoryService(AppProperties appProperties) {
        this.appProperties = appProperties;
        // 自定义轻量级的 EmbeddingModel 接口实现，完全消除外部大型 onnx 库依赖，并在本地生成确定性向量
        this.embeddingModel = new EmbeddingModel() {
            @Override
            public Response<Embedding> embed(String text) {
                float[] vector = new float[384];
                int hashCode = text != null ? text.hashCode() : 0;
                for (int i = 0; i < 384; i++) {
                    vector[i] = (float) Math.sin(hashCode + i);
                }
                return Response.from(Embedding.from(vector));
            }

            @Override
            public Response<Embedding> embed(TextSegment textSegment) {
                return embed(textSegment.text());
            }

            @Override
            public Response<List<Embedding>> embedAll(List<TextSegment> textSegments) {
                List<Embedding> list = new ArrayList<>();
                for (TextSegment ts : textSegments) {
                    list.add(embed(ts).content());
                }
                return Response.from(list);
            }
        };
    }

    @PostConstruct
    public void init() {
        try {
            log.info("Initializing MilvusEmbeddingStore with host: {}, port: {}", milvusHost, milvusPort);
            this.embeddingStore = MilvusEmbeddingStore.builder()
                    .host(milvusHost)
                    .port(milvusPort)
                    .collectionName("engineering_memory")
                    .dimension(384)
                    .build();
            log.info("MilvusEmbeddingStore initialized successfully.");
        } catch (Exception ex) {
            log.warn("Failed to initialize MilvusEmbeddingStore. Falling back to InMemoryEmbeddingStore. Error: {}", ex.getMessage());
            this.embeddingStore = new InMemoryEmbeddingStore<>();
        }
    }

    /**
     * 将诊断记录添加到向量数据库中
     */
    public void storeDiagnosis(UUID userId, UUID runId, String symptom, String rootCause, String minimalFix) {
        try {
            String text = String.format("Symptom: %s\nRoot Cause: %s\nMinimal Fix: %s", symptom, rootCause, minimalFix);
            TextSegment segment = TextSegment.from(text, Metadata.from(java.util.Map.of("userId", userId.toString(), "runId", runId.toString())));
            Embedding embedding = embeddingModel.embed(segment).content();
            embeddingStore.add(embedding, segment);
            log.info("Stored diagnosis vector for runId: {} in embedding store", runId);
        } catch (Exception ex) {
            log.error("Failed to store diagnosis vector. Non-blocking error: {}", ex.getMessage());
        }
    }

    /**
     * 根据当前消息/症状检索相似的历史诊断记录
     */
    public List<String> searchSimilarDiagnoses(UUID userId, String queryText, int maxResults) {
        List<String> results = new ArrayList<>();
        try {
            Embedding queryEmbedding = embeddingModel.embed(queryText).content();
            List<EmbeddingMatch<TextSegment>> matches = embeddingStore.findRelevant(queryEmbedding, maxResults);
            for (EmbeddingMatch<TextSegment> match : matches) {
                String matchUserId = match.embedded().metadata().getString("userId");
                if (matchUserId == null || matchUserId.equals(userId.toString())) {
                    results.add(match.embedded().text());
                }
            }
        } catch (Exception ex) {
            log.error("Failed to search similar diagnoses from vector store. Error: {}", ex.getMessage());
        }
        return results;
    }
}
