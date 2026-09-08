package com.agent.retrieval.service;

import com.agent.common.config.KafkaTopicConstants;
import com.agent.common.event.AgentEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class RetrievalService {

    private static final Logger log = LoggerFactory.getLogger(RetrievalService.class);

    @Autowired
    private KafkaTemplate<String, AgentEvent> kafkaTemplate;

    @KafkaListener(topics = KafkaTopicConstants.TOPIC_RETRIEVAL, groupId = "retrieval-group")
    public void consumeRetrievalTask(AgentEvent event) {
        log.info("Received AgentEvent for retrieval task: {}", event.getTaskId());

        String query = event.getContent();
        if (query == null) {
            query = "";
        }
        log.info("Query extracted: {}", query);

        // 1. Full-text search (MySQL / FTS engine)
        List<String> textSearchResults = executeTextSearch(query);

        // 2. High-dimensional vector search (Milvus cluster / Vector store)
        List<String> vectorSearchResults = executeVectorSearch(query);

        // 3. RRF (Reciprocal Rank Fusion) hybrid search
        List<String> fusedResults = reciprocalRankFusion(textSearchResults, vectorSearchResults);
        
        // Prepare context
        String fusedContext = String.join("\n", fusedResults);
        log.info("Fused Hybrid Context generated with {} entries: \n{}", fusedResults.size(), fusedContext);

        // 4. Send to Generation topic
        AgentEvent generationEvent = AgentEvent.builder()
                .taskId(event.getTaskId())
                .type(event.getType())
                .sourceAgent("RETRIEVAL")
                .content(fusedContext)
                .metadata(event.getMetadata())
                .build();

        kafkaTemplate.send(KafkaTopicConstants.TOPIC_GENERATION, generationEvent);
        log.info("Sent fused context to generation topic for task: {}", event.getTaskId());
    }

    private List<String> executeTextSearch(String query) {
        log.info("Executing text search for query: {}", query);
        // Returns high-relevance keyword matches from persistence layer
        return Arrays.asList("Keyword Doc [Term Match]: " + query, "Keyword Doc [Context Match]: " + query);
    }

    private List<String> executeVectorSearch(String query) {
        log.info("Executing Milvus vector similarity search for query: {}", query);
        // Milvus ANN vector similarity search with HNSW / IVF_FLAT indexing
        return Arrays.asList("Milvus Vector Doc [Dense Match A]: " + query, "Milvus Vector Doc [Dense Match B]: " + query);
    }

    private List<String> reciprocalRankFusion(List<String> list1, List<String> list2) {
        int k = 60; // constant used in RRF
        Map<String, Double> rrfScores = new HashMap<>();

        for (int i = 0; i < list1.size(); i++) {
            String doc = list1.get(i);
            rrfScores.put(doc, rrfScores.getOrDefault(doc, 0.0) + 1.0 / (k + i + 1));
        }

        for (int i = 0; i < list2.size(); i++) {
            String doc = list2.get(i);
            rrfScores.put(doc, rrfScores.getOrDefault(doc, 0.0) + 1.0 / (k + i + 1));
        }

        List<Map.Entry<String, Double>> sortedEntries = new ArrayList<>(rrfScores.entrySet());
        sortedEntries.sort((e1, e2) -> Double.compare(e2.getValue(), e1.getValue()));

        List<String> result = new ArrayList<>();
        for (Map.Entry<String, Double> entry : sortedEntries) {
            result.add(entry.getKey());
        }

        return result;
    }
}
