package com.agent.mvp.coach.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import com.agent.mvp.agent.service.RAGMemoryService;
import com.agent.mvp.coach.dto.RequirementBreakdownRequest;
import com.agent.mvp.coach.dto.SentinelAlertResponse;
import com.agent.mvp.coach.dto.SentinelReportRequest;
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
                        mock(com.agent.mvp.auth.service.UserService.class),
                        mock(com.agent.mvp.coach.agent.SupervisorAgent.class),
                        mock(com.agent.mvp.agent.service.CodeRAGService.class),
                        mock(SentinelAlertBroadcaster.class),
                        new io.micrometer.core.instrument.simple.SimpleMeterRegistry());
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

    @Test
    void handleSentinelReportShouldBroadcastStructuredAlert() {
        ModelGateway gateway = mock(ModelGateway.class);
        DevCoachRunRepository repository = mock(DevCoachRunRepository.class);
        RAGMemoryService ragMemoryService = mock(RAGMemoryService.class);
        SentinelAlertBroadcaster broadcaster = mock(SentinelAlertBroadcaster.class);
        com.agent.mvp.agent.service.CodeRAGService codeRAGService =
                mock(com.agent.mvp.agent.service.CodeRAGService.class);
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
                        mock(com.agent.mvp.auth.service.UserService.class),
                        mock(com.agent.mvp.coach.agent.SupervisorAgent.class),
                        codeRAGService,
                        broadcaster,
                        new io.micrometer.core.instrument.simple.SimpleMeterRegistry());

        when(gateway.chat(any(), any()))
                .thenReturn(
                        new ModelChatResponse(
                                """
{
  "symptom":"Crash on startup",
  "rootCause":"Missing OPENAI_API_KEY",
  "triggerCondition":"Boot with empty model config",
  "minimalFix":"Set OPENAI_API_KEY in env/dev.env",
  "verificationSteps":["Run mvn test","Start the app"]
}
""",
                                5,
                                List.of(),
                                "stop"));
        when(repository.insert(any(com.agent.mvp.coach.entity.DevCoachRun.class)))
                .thenAnswer(invocation -> 1);
        when(codeRAGService.searchRelatedCode(any(), eq(3))).thenReturn(List.of("public class Demo {}"));

        service.handleSentinelReport(new SentinelReportRequest("demo-project", "stack trace"));

        verify(broadcaster)
                .publish(new SentinelAlertResponse("Missing OPENAI_API_KEY", "Set OPENAI_API_KEY in env/dev.env"));
    }
}
