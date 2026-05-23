package com.agent.mvp.coach.service;

import com.agent.mvp.coach.dto.ScaffoldRequest;
import com.agent.mvp.common.exception.BadRequestException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ScaffoldTemplateRegistryTest {

    private final ScaffoldTemplateRegistry registry = new ScaffoldTemplateRegistry();

    @Test
    void shouldGenerateBuildableSpringAiRagStarterShape() {
        var scaffold = registry.generate(new ScaffoldRequest(
                "spring-ai-rag-starter",
                "java-rag-demo",
                "com.example.rag",
                "demo"
        ));

        assertEquals("spring-ai-rag-starter", scaffold.preset());
        assertTrue(scaffold.files().stream().anyMatch(file -> file.path().equals("pom.xml")));
        assertTrue(scaffold.files().stream().anyMatch(file -> file.path().contains("DevCoachService.java")));
        assertTrue(scaffold.startCommands().contains("mvn -q test"));
    }

    @Test
    void shouldRejectUnknownPreset() {
        assertThrows(BadRequestException.class, () -> registry.generate(new ScaffoldRequest(
                "unknown",
                "java-rag-demo",
                "com.example.rag",
                null
        )));
    }
}
