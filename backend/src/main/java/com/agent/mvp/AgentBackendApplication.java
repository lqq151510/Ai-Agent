package com.agent.mvp;

import com.agent.mvp.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class AgentBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(AgentBackendApplication.class, args);
    }
}
