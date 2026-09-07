package com.agent.mvp.ingestion.mq;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.agent.mvp.agent.service.RAGMemoryService;
import com.agent.mvp.core.agent.config.KafkaTopicConfig;
import com.agent.mvp.ingestion.event.KnowledgeIngestionEvent;
import com.agent.mvp.ingestion.service.IngestionJobService;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;

class KnowledgeIngestionMqTest {

    @Test
    @DisplayName("When KafkaTemplate is null, producer falls back and returns false")
    void testProducerFallbackWhenKafkaNotAvailable() {
        KnowledgeIngestionProducer producer = new KnowledgeIngestionProducer(null);
        assertFalse(producer.isKafkaEnabled());

        KnowledgeIngestionEvent event =
                KnowledgeIngestionEvent.builder()
                        .userId(UUID.randomUUID())
                        .knowledgeItemId(UUID.randomUUID())
                        .title("Test Doc")
                        .content("Sample content")
                        .build();

        boolean published = producer.publishIngestionEvent(event);
        assertFalse(published);
    }

    @Test
    @DisplayName("When KafkaTemplate is present, producer sends message to retrieval topic")
    @SuppressWarnings("unchecked")
    void testProducerPublishesSuccessfully() {
        KafkaTemplate<String, Object> kafkaTemplate = mock(KafkaTemplate.class);
        java.util.concurrent.CompletableFuture<
                        org.springframework.kafka.support.SendResult<String, Object>>
                future =
                        java.util.concurrent.CompletableFuture.completedFuture(
                                mock(org.springframework.kafka.support.SendResult.class));
        org.mockito.Mockito.when(kafkaTemplate.send(any(), any(), any())).thenReturn(future);
        KnowledgeIngestionProducer producer = new KnowledgeIngestionProducer(kafkaTemplate);
        assertTrue(producer.isKafkaEnabled());

        UUID itemId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        KnowledgeIngestionEvent event =
                KnowledgeIngestionEvent.builder()
                        .userId(userId)
                        .knowledgeItemId(itemId)
                        .title("Test Doc")
                        .content("Sample content")
                        .timestamp(Instant.now())
                        .build();

        boolean published = producer.publishIngestionEvent(event);
        assertTrue(published);
        verify(kafkaTemplate, times(1))
                .send(eq(KafkaTopicConfig.TOPIC_RETRIEVAL), eq(itemId.toString()), eq(event));
    }

    @Test
    @DisplayName("Consumer calls RAGMemoryService to ingest text chunks")
    void testConsumerProcessesEvent() {
        RAGMemoryService ragMemoryService = mock(RAGMemoryService.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeIngestionConsumer consumer =
                new KnowledgeIngestionConsumer(ragMemoryService, ingestionJobService);

        UUID itemId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        KnowledgeIngestionEvent event =
                KnowledgeIngestionEvent.builder()
                        .userId(userId)
                        .knowledgeItemId(itemId)
                        .title("Architecture Spec")
                        .content("Spring Boot + Kafka + Milvus RAG details")
                        .timestamp(Instant.now())
                        .build();

        consumer.consumeIngestionTask(event);

        verify(ragMemoryService, times(1))
                .ingestText(
                        eq(userId),
                        eq(itemId),
                        eq("Spring Boot + Kafka + Milvus RAG details"),
                        eq("Architecture Spec"));
    }

    @Test
    @DisplayName("Consumer safely discards event if null or missing userId")
    void testConsumerHandlesInvalidEvent() {
        RAGMemoryService ragMemoryService = mock(RAGMemoryService.class);
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeIngestionConsumer consumer =
                new KnowledgeIngestionConsumer(ragMemoryService, ingestionJobService);

        consumer.consumeIngestionTask(null);
        consumer.consumeIngestionTask(KnowledgeIngestionEvent.builder().build());

        verify(ragMemoryService, times(0)).ingestText(any(), any(), any(), any());
    }

    @Test
    @DisplayName(
            "Consumer rethrows RuntimeException when ingestion fails so Spring Kafka DLT can"
                    + " trigger")
    void testConsumerRethrowsExceptionOnError() {
        RAGMemoryService ragMemoryService = mock(RAGMemoryService.class);
        org.mockito.Mockito.doThrow(new RuntimeException("Milvus connection timeout"))
                .when(ragMemoryService)
                .ingestText(any(), any(), any(), any());
        IngestionJobService ingestionJobService = mock(IngestionJobService.class);
        KnowledgeIngestionConsumer consumer =
                new KnowledgeIngestionConsumer(ragMemoryService, ingestionJobService);

        KnowledgeIngestionEvent event =
                KnowledgeIngestionEvent.builder()
                        .userId(UUID.randomUUID())
                        .knowledgeItemId(UUID.randomUUID())
                        .title("Title")
                        .content("Content")
                        .build();

        org.junit.jupiter.api.Assertions.assertThrows(
                RuntimeException.class, () -> consumer.consumeIngestionTask(event));
    }
}
