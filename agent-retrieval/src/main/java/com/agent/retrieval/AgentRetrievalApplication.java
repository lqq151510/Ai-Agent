package com.agent.retrieval;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;

@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
public class AgentRetrievalApplication {
    public static void main(String[] args) {
        SpringApplication.run(AgentRetrievalApplication.class, args);
    }
}
