package com.agent.mvp.core.agent.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
@Profile("mq")
public class KafkaTopicConfig {

    public static final String TOPIC_TASK_INPUT = "task-input-topic";
    public static final String TOPIC_SSE_EVENT = "sse-event-topic";
    public static final String TOPIC_RETRIEVAL = "retrieval-task-topic";
    public static final String TOPIC_GENERATION = "generation-task-topic";
    public static final String TOPIC_REFLECTION = "reflection-task-topic";

    @Bean
    public NewTopic taskInputTopic() {
        return TopicBuilder.name(TOPIC_TASK_INPUT).partitions(3).replicas(1).build();
    }

    @Bean
    public NewTopic sseEventTopic() {
        return TopicBuilder.name(TOPIC_SSE_EVENT).partitions(3).replicas(1).build();
    }

    @Bean
    public NewTopic retrievalTopic() {
        return TopicBuilder.name(TOPIC_RETRIEVAL).partitions(3).replicas(1).build();
    }

    @Bean
    public NewTopic generationTopic() {
        return TopicBuilder.name(TOPIC_GENERATION).partitions(3).replicas(1).build();
    }

    @Bean
    public NewTopic reflectionTopic() {
        return TopicBuilder.name(TOPIC_REFLECTION).partitions(3).replicas(1).build();
    }
}
