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
    private final boolean kafkaEnabled;

    @Autowired
    public KnowledgeIngestionProducer(
            Optional<KafkaTemplate<String, Object>> kafkaTemplate,
            @org.springframework.beans.factory.annotation.Value(
                            "${app.kafka.enabled:${spring.kafka.consumer.auto-startup:false}}")
                    boolean kafkaEnabled) {
        this.kafkaTemplate = kafkaTemplate != null ? kafkaTemplate : Optional.empty();
        this.kafkaEnabled = kafkaEnabled;
    }

    public KnowledgeIngestionProducer(KafkaTemplate<String, Object> kafkaTemplate) {
        this(Optional.ofNullable(kafkaTemplate), true);
    }

    public KnowledgeIngestionProducer(
            KafkaTemplate<String, Object> kafkaTemplate, boolean kafkaEnabled) {
        this(Optional.ofNullable(kafkaTemplate), kafkaEnabled);
    }

    public boolean isKafkaEnabled() {
        return kafkaTemplate.isPresent() && kafkaEnabled;
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
            var future = kafkaTemplate.get().send(KafkaTopicConfig.TOPIC_RETRIEVAL, key, event);
            if (future != null) {
                // 同步等待 Broker ACK 确认（超时 2 秒），避免异步投递静默失败
                future.get(2, java.util.concurrent.TimeUnit.SECONDS);
            }
            log.info(
                    "Successfully published KnowledgeIngestionEvent to topic {} for item {}",
                    KafkaTopicConfig.TOPIC_RETRIEVAL,
                    event.getKnowledgeItemId());
            return true;
        } catch (Exception ex) {
            log.warn(
                    "Failed to deliver KnowledgeIngestionEvent to Kafka broker. Falling back to"
                            + " local processing. Error: {}",
                    ex.getMessage());
            return false;
        }
    }
}
