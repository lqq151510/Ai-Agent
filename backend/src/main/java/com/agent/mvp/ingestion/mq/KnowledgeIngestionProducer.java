package com.agent.mvp.ingestion.mq;

import com.agent.mvp.core.agent.config.KafkaTopicConfig;
import com.agent.mvp.ingestion.event.KnowledgeIngestionEvent;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

/** 知识切片与向量化事件生产者。 支持 Kafka 异步投递，并在无 Kafka 环境下优雅退避至本地处理通道。 */
@Component
public class KnowledgeIngestionProducer {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeIngestionProducer.class);

    private final Optional<KafkaTemplate<String, Object>> kafkaTemplate;

    public KnowledgeIngestionProducer(
            @Autowired(required = false) KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = Optional.ofNullable(kafkaTemplate);
    }

    public boolean isKafkaEnabled() {
        return kafkaTemplate.isPresent();
    }

    /**
     * 发送知识摄取事件至 Kafka Topic 进行削峰解耦；若未配置 Kafka，返回 false 由本地异步降级处理。
     *
     * @param event 知识摄取事件
     * @return true 表示成功投递至 Kafka，false 表示需要本地降级
     */
    public boolean publishIngestionEvent(KnowledgeIngestionEvent event) {
        if (kafkaTemplate.isEmpty()) {
            log.debug("KafkaTemplate not available, will handle ingestion via local threadpool.");
            return false;
        }

        try {
            String key =
                    event.getKnowledgeItemId() != null
                            ? event.getKnowledgeItemId().toString()
                            : (event.getUserId() != null
                                    ? event.getUserId().toString()
                                    : "unknown");
            kafkaTemplate.get().send(KafkaTopicConfig.TOPIC_RETRIEVAL, key, event);
            log.info(
                    "Successfully published KnowledgeIngestionEvent to topic {} for item {}",
                    KafkaTopicConfig.TOPIC_RETRIEVAL,
                    event.getKnowledgeItemId());
            return true;
        } catch (Exception ex) {
            log.warn(
                    "Failed to publish KnowledgeIngestionEvent to Kafka, falling back to local"
                            + " processing. Error: {}",
                    ex.getMessage());
            return false;
        }
    }
}
