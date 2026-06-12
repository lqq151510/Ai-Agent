package com.agent.mvp.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration
public class ExecutorConfig {

    @Bean(name = "agentStreamExecutor")
    public ThreadPoolTaskExecutor agentStreamExecutor(AppProperties appProperties) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(
                Math.max(1, appProperties.getAgent().getStreamExecutorCorePoolSize()));
        executor.setMaxPoolSize(
                Math.max(1, appProperties.getAgent().getStreamExecutorMaxPoolSize()));
        executor.setQueueCapacity(
                Math.max(1, appProperties.getAgent().getStreamExecutorQueueCapacity()));
        executor.setKeepAliveSeconds(60);
        executor.setThreadNamePrefix("agent-stream-");
        executor.setDaemon(true);
        executor.initialize();
        return executor;
    }

    @Bean(name = "agentHeartbeatScheduler")
    public ThreadPoolTaskScheduler agentHeartbeatScheduler(AppProperties appProperties) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(Math.max(1, appProperties.getAgent().getHeartbeatThreads()));
        scheduler.setThreadNamePrefix("agent-heartbeat-");
        scheduler.setDaemon(true);
        scheduler.initialize();
        return scheduler;
    }
}
