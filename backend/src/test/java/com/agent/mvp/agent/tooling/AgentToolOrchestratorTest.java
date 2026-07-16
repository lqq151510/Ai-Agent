package com.agent.mvp.agent.tooling;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.agent.mvp.tooling.service.CodeToolService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AgentToolOrchestratorTest {

    @Test
    void listToolSpecsShouldExposeStrictFunctionSchemas() {
        AgentToolOrchestrator orchestrator =
                new AgentToolOrchestrator(
                        java.util.Optional.of(
                                org.mockito.Mockito.<CodeToolService>mock(CodeToolService.class)),
                        new ObjectMapper());

        ToolSpec searchCode =
                orchestrator.listToolSpecs().stream()
                        .filter(spec -> "searchCode".equals(spec.name()))
                        .findFirst()
                        .orElseThrow();

        ToolSpec readFile =
                orchestrator.listToolSpecs().stream()
                        .filter(spec -> "readFile".equals(spec.name()))
                        .findFirst()
                        .orElseThrow();

        assertEquals(Boolean.FALSE, searchCode.inputJsonSchema().get("additionalProperties"));
        assertEquals(List.of("query"), searchCode.inputJsonSchema().get("required"));
        assertEquals(List.of("path"), readFile.inputJsonSchema().get("required"));

        @SuppressWarnings("unchecked")
        Map<String, Object> properties =
                (Map<String, Object>) searchCode.inputJsonSchema().get("properties");
        assertNotNull(properties);
        @SuppressWarnings("unchecked")
        Map<String, Object> maxResults = (Map<String, Object>) properties.get("maxResults");
        assertNotNull(maxResults);
        assertEquals("integer", maxResults.get("type"));
        assertEquals(1, maxResults.get("minimum"));
        assertFalse(maxResults.isEmpty());
    }
}
