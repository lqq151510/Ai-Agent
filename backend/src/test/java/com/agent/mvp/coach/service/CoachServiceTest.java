package com.agent.mvp.coach.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import com.agent.mvp.agent.service.RAGMemoryService;
import com.agent.mvp.coach.dto.RequirementBreakdownRequest;
import com.agent.mvp.coach.repo.DevCoachRunRepository;
import com.agent.mvp.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CoachServiceTest {

    @Test
    void breakdownShouldParseStrictJsonAndPersistRun() {
        ModelGateway gateway = mock(ModelGateway.class);
        DevCoachRunRepository repository = mock(DevCoachRunRepository.class);
        RAGMemoryService ragMemoryService = mock(RAGMemoryService.class);
        var service =
                new CoachService(
                        gateway,
                        new CoachPromptService(),
                        new ScaffoldTemplateRegistry(),
                        new ScaffoldZipService(),
                        repository,
                        new AppProperties(),
                        new ObjectMapper(),
                        ragMemoryService,
                        mock(com.agent.mvp.auth.service.UserService.class));
        when(repository.insert(any(com.agent.mvp.coach.entity.DevCoachRun.class)))
                .thenAnswer(
                        invocation -> {
                            return 1;
                        });
        when(gateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(
                        new ModelChatResponse(
                                """
{
  "goal":"Build a Java RAG assistant",
  "modules":[{"name":"ingest","description":"load docs"}],
  "dataStructures":[{"name":"DocumentChunk","description":"chunk data"}],
  "apiEndpoints":[{"method":"POST","path":"/api/rag/query","purpose":"ask"}],
  "risks":[{"name":"hallucination","description":"ground answers"}],
  "testPoints":["query returns grounded answer"]
}
""",
                                5,
                                List.of(),
                                "stop"));

        var response =
                service.breakdown(
                        UUID.randomUUID(), new RequirementBreakdownRequest("rag", null, null));

        assertEquals("Build a Java RAG assistant", response.breakdown().goal());
        assertEquals("ingest", response.breakdown().modules().get(0).name());
        assertEquals("/api/rag/query", response.breakdown().apiEndpoints().get(0).path());
        assertNull(response.parseWarning());
    }
}
