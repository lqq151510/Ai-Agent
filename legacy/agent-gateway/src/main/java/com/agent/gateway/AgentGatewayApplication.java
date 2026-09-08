package com.agent.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class AgentGatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(AgentGatewayApplication.class, args);
    }
}
