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

        // 1. Mock MySQL full-text search
        List<String> mysqlResults = mockMysqlSearch(query);

        // 2. Mock Milvus vector search
        List<String> milvusResults = mockMilvusSearch(query);

        // 3. RRF Fusion
        List<String> fusedResults = reciprocalRankFusion(mysqlResults, milvusResults);
        
        // Prepare context
        String fusedContext = String.join("\n", fusedResults);
        log.info("Fused Context: \n{}", fusedContext);

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

    private List<String> mockMysqlSearch(String query) {
        log.info("Executing MySQL full-text search for query: {}", query);
        return Arrays.asList("MySQL Document 1 matched for: " + query, "MySQL Document 2 matched for: " + query);
    }

    private List<String> mockMilvusSearch(String query) {
        log.info("Executing Milvus vector search for query: {}", query);
        return Arrays.asList("Milvus Document A matched for: " + query, "Milvus Document B matched for: " + query);
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
