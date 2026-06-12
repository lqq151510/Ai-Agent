package com.agent.mvp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableCaching
@EnableAsync
public class AgentBackendApplication {

    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(AgentBackendApplication.class);

        for (int i = 0; i < args.length; i++) {
            if ("--port".equals(args[i]) && i + 1 < args.length) {
                app.setDefaultProperties(java.util.Map.of("server.port", args[i + 1]));
            }
            if ("--data-dir".equals(args[i]) && i + 1 < args.length) {
                app.setDefaultProperties(java.util.Map.of("app.data-dir", args[i + 1]));
            }
        }

        app.run(args);
    }
}
