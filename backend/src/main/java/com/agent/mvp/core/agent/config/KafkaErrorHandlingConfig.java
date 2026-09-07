package com.agent.mvp.core.agent.config;

import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.CommonErrorHandler;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.ExponentialBackOff;

/**
 * Kafka 消费端错误处理与死信队列（DLT）配置。
 *
 * <p>配置 {@link DefaultErrorHandler}： 1. 遇到可重试异常时，执行指数退避重试（初始 1 秒，乘数 2.0，最大 2 次重试）； 2.
 * 超过最大重试次数或遇到非可重试异常时，通过 {@link DeadLetterPublishingRecoverer} 将消息路由至对应的死信主题（如
 * retrieval-task-topic.DLT），避免毒丸消息阻塞消费分区。
 */
@Configuration
@ConditionalOnProperty(name = "app.kafka.enabled", havingValue = "true")
@ConditionalOnClass(name = "org.springframework.kafka.listener.DefaultErrorHandler")
public class KafkaErrorHandlingConfig {

    private static final Logger log = LoggerFactory.getLogger(KafkaErrorHandlingConfig.class);

    @Bean
    public DeadLetterPublishingRecoverer deadLetterPublishingRecoverer(
            KafkaTemplate<String, Object> kafkaTemplate) {
        return new DeadLetterPublishingRecoverer(
                kafkaTemplate,
                (record, ex) -> {
                    String dltTopic = record.topic() + ".DLT";
                    log.warn(
                            "Kafka record processing failed, routing from topic {}"
                                    + " partition {} to DLT topic {}. Reason: {}",
                            record.topic(),
                            record.partition(),
                            dltTopic,
                            ex.getMessage());
                    return new TopicPartition(dltTopic, record.partition());
                });
    }

    @Bean
    public CommonErrorHandler kafkaCommonErrorHandler(
            DeadLetterPublishingRecoverer deadLetterPublishingRecoverer) {
        ExponentialBackOff backOff = new ExponentialBackOff(1000L, 2.0);
        backOff.setMaxElapsedTime(4000L);

        DefaultErrorHandler errorHandler =
                new DefaultErrorHandler(deadLetterPublishingRecoverer, backOff);
        errorHandler.addNotRetryableExceptions(
                IllegalArgumentException.class, NullPointerException.class);
        return errorHandler;
    }
}
