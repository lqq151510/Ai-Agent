package com.agent.mvp.ingestion.mq;

import com.agent.mvp.agent.service.RAGMemoryService;
import com.agent.mvp.core.agent.config.KafkaTopicConfig;
import com.agent.mvp.ingestion.event.KnowledgeIngestionEvent;
import com.agent.mvp.ingestion.service.IngestionJobService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/** Kafka 知识摄取事件消费者。 负责从消息队列中接收知识文档，执行异步分块、嵌入并写入向量数据库（Milvus / PgVector / 本地）。 */
@Component
@ConditionalOnClass(name = "org.springframework.kafka.annotation.KafkaListener")
public class KnowledgeIngestionConsumer {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeIngestionConsumer.class);

    private final RAGMemoryService ragMemoryService;
    private final IngestionJobService ingestionJobService;

    public KnowledgeIngestionConsumer(
            RAGMemoryService ragMemoryService, IngestionJobService ingestionJobService) {
        this.ragMemoryService = ragMemoryService;
        this.ingestionJobService = ingestionJobService;
    }

    @KafkaListener(
            topics = KafkaTopicConfig.TOPIC_RETRIEVAL,
            groupId = "knowledge-ingest-group",
            autoStartup = "${app.kafka.enabled:${spring.kafka.consumer.auto-startup:false}}")
    public void consumeIngestionTask(KnowledgeIngestionEvent event) {
        if (event == null || event.getUserId() == null) {
            log.warn("Discarding invalid KnowledgeIngestionEvent: null or missing userId");
            return;
        }

        log.info(
                "Received Kafka ingestion event for item: {}, user: {}",
                event.getKnowledgeItemId(),
                event.getUserId());
        try {
            if (event.getContent() != null && !event.getContent().isBlank()) {
                if (event.getKnowledgeItemId() != null
                        && ragMemoryService.isAlreadyIngested(
                                event.getKnowledgeItemId(), event.getContent())) {
                    log.info(
                            "Kafka ingestion event for item {} already processed, skipping"
                                    + " duplicate message.",
                            event.getKnowledgeItemId());
                    return;
                }
                ragMemoryService.ingestText(
                        event.getUserId(),
                        event.getKnowledgeItemId(),
                        event.getContent(),
                        event.getTitle());
            }
            log.info(
                    "Successfully processed ingestion event from Kafka for item: {}",
                    event.getKnowledgeItemId());
        } catch (Exception ex) {
            log.error(
                    "Failed to process Kafka ingestion event for item: {}. Error: {}",
                    event.getKnowledgeItemId(),
                    ex.getMessage(),
                    ex);
            // 重新抛出异常，触发 Spring Kafka 容器的 DefaultErrorHandler 重试或路由至死信队列（DLT）
            throw new RuntimeException(
                    "Kafka document ingestion failed for item " + event.getKnowledgeItemId(), ex);
        }
    }
}
