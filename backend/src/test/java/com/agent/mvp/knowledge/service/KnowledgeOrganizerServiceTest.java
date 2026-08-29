package com.agent.mvp.knowledge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import com.agent.mvp.knowledge.entity.KnowledgeItem;
import com.agent.mvp.modelsource.entity.ModelSource;
import com.agent.mvp.modelsource.repo.ModelSourceRepository;
import com.agent.mvp.modelsource.service.ModelSourceProbeService;
import com.agent.mvp.settings.entity.UserProfile;
import com.agent.mvp.settings.service.UserProfileService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class KnowledgeOrganizerServiceTest {

    @Test
    void shouldOrganizeSnippetIntoSummaryLanguageAndTags() {
        KnowledgeOrganizerService service = new KnowledgeOrganizerService();
        KnowledgeItem item =
                KnowledgeItem.builder()
                        .sourceType("snippet")
                        .title("Spring AI RAG notes")
                        .rawContent(
                                "Spring AI helps build RAG pipelines with retrieval and"
                                        + " generation.")
                        .build();

        var result = service.organize(item);

        assertEquals("en", result.language());
        assertTrue(result.wordCount() > 5);
        assertTrue(result.summary().contains("Spring AI"));
        assertTrue(result.tags().contains("snippet"));
        assertFalse(result.tags().isEmpty());
    }

    @Test
    void shouldPreferSummaryLocalSourceAndParseFencedJson() {
        ModelGateway gateway = mock(ModelGateway.class);
        ModelSourceRepository sourceRepository = mock(ModelSourceRepository.class);
        UserProfileService profileService = mock(UserProfileService.class);
        ModelSourceProbeService probeService = mock(ModelSourceProbeService.class);
        KnowledgeOrganizerService service =
                new KnowledgeOrganizerService(
                        gateway,
                        sourceRepository,
                        profileService,
                        probeService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        UUID summarySourceId = UUID.randomUUID();
        UUID defaultSourceId = UUID.randomUUID();
        ModelSource summarySource =
                localSource(userId, summarySourceId, "http://127.0.0.1:1234/v1");
        when(profileService.getOrCreate(userId))
                .thenReturn(
                        UserProfile.builder()
                                .userId(userId)
                                .summaryModelSourceId(summarySourceId)
                                .defaultModelSourceId(defaultSourceId)
                                .build());
        when(sourceRepository.selectById(summarySourceId)).thenReturn(summarySource);
        when(gateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(
                        new ModelChatResponse(
                                """
                                ```json
                                {"summary":"Local summary","tags":["Java","RAG"]}
                                ```
                                """,
                                20,
                                List.of(),
                                "stop"));

        var result =
                service.organize(
                        KnowledgeItem.builder()
                                .userId(userId)
                                .sourceType("snippet")
                                .title("RAG note")
                                .rawContent("Local content for an indexed note.")
                                .build());

        assertEquals("local_model", result.organizationStrategy());
        assertEquals("Local summary", result.summary());
        assertEquals(List.of("java", "rag"), result.tags());
        ArgumentCaptor<ModelChatRequest> requestCaptor =
                ArgumentCaptor.forClass(ModelChatRequest.class);
        verify(gateway).chat(eq(ModelProviderType.OPENAI), requestCaptor.capture());
        assertEquals("qwen-local", requestCaptor.getValue().model());
        assertEquals("http://127.0.0.1:1234/v1", requestCaptor.getValue().customBaseUrl());
        assertEquals(25_000L, requestCaptor.getValue().timeoutMs());
    }

    @Test
    void shouldUseDefaultLocalSourceWhenSummarySourceIsNotEligible() {
        ModelGateway gateway = mock(ModelGateway.class);
        ModelSourceRepository sourceRepository = mock(ModelSourceRepository.class);
        UserProfileService profileService = mock(UserProfileService.class);
        ModelSourceProbeService probeService = mock(ModelSourceProbeService.class);
        KnowledgeOrganizerService service =
                new KnowledgeOrganizerService(
                        gateway,
                        sourceRepository,
                        profileService,
                        probeService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        UUID summarySourceId = UUID.randomUUID();
        UUID defaultSourceId = UUID.randomUUID();
        ModelSource cloudSummary = localSource(userId, summarySourceId, "http://127.0.0.1:1234/v1");
        cloudSummary.setEnabled(false);
        ModelSource defaultSource =
                localSource(userId, defaultSourceId, "http://127.0.0.1:1234/v1");
        when(profileService.getOrCreate(userId))
                .thenReturn(
                        UserProfile.builder()
                                .userId(userId)
                                .summaryModelSourceId(summarySourceId)
                                .defaultModelSourceId(defaultSourceId)
                                .build());
        when(sourceRepository.selectById(summarySourceId)).thenReturn(cloudSummary);
        when(sourceRepository.selectById(defaultSourceId)).thenReturn(defaultSource);
        when(gateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(
                        new ModelChatResponse(
                                "{\"summary\":\"Default local summary\",\"tags\":[\"Local\"]}",
                                20,
                                List.of(),
                                "stop"));

        var result =
                service.organize(
                        KnowledgeItem.builder()
                                .userId(userId)
                                .sourceType("snippet")
                                .title("Local note")
                                .rawContent("Local content")
                                .build());

        assertEquals("local_model", result.organizationStrategy());
        assertEquals("Default local summary", result.summary());
        verify(sourceRepository).selectById(summarySourceId);
        verify(sourceRepository).selectById(defaultSourceId);
    }

    @Test
    void shouldUseHeuristicsWithoutCallingUnverifiedLocalModel() {
        ModelGateway gateway = mock(ModelGateway.class);
        ModelSourceRepository sourceRepository = mock(ModelSourceRepository.class);
        UserProfileService profileService = mock(UserProfileService.class);
        ModelSourceProbeService probeService = mock(ModelSourceProbeService.class);
        KnowledgeOrganizerService service =
                new KnowledgeOrganizerService(
                        gateway,
                        sourceRepository,
                        profileService,
                        probeService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        ModelSource failedSource = localSource(userId, sourceId, "http://127.0.0.1:1234/v1");
        failedSource.setLastCheckStatus("error");
        when(profileService.getOrCreate(userId))
                .thenReturn(
                        UserProfile.builder()
                                .userId(userId)
                                .summaryModelSourceId(sourceId)
                                .build());
        when(sourceRepository.selectById(sourceId)).thenReturn(failedSource);

        var result =
                service.organize(
                        KnowledgeItem.builder()
                                .userId(userId)
                                .sourceType("snippet")
                                .title("Unchecked local note")
                                .rawContent(
                                        "This note should remain available without a model call.")
                                .build());

        assertEquals("heuristic", result.organizationStrategy());
        verify(gateway, never()).chat(any(), any());
        verify(probeService, never()).validateForUse(any());
    }

    @Test
    void shouldUseHeuristicsWithoutCallingUntestedLocalModel() {
        ModelGateway gateway = mock(ModelGateway.class);
        ModelSourceRepository sourceRepository = mock(ModelSourceRepository.class);
        UserProfileService profileService = mock(UserProfileService.class);
        ModelSourceProbeService probeService = mock(ModelSourceProbeService.class);
        KnowledgeOrganizerService service =
                new KnowledgeOrganizerService(
                        gateway,
                        sourceRepository,
                        profileService,
                        probeService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        ModelSource untestedSource = localSource(userId, sourceId, "http://127.0.0.1:1234/v1");
        untestedSource.setLastCheckStatus(null);
        when(profileService.getOrCreate(userId))
                .thenReturn(
                        UserProfile.builder()
                                .userId(userId)
                                .summaryModelSourceId(sourceId)
                                .build());
        when(sourceRepository.selectById(sourceId)).thenReturn(untestedSource);

        var result =
                service.organize(
                        KnowledgeItem.builder()
                                .userId(userId)
                                .sourceType("snippet")
                                .title("Untested local note")
                                .rawContent("This note should not wait for a local model call.")
                                .build());

        assertEquals("heuristic", result.organizationStrategy());
        verify(gateway, never()).chat(any(), any());
        verify(probeService, never()).validateForUse(any());
    }

    @Test
    void shouldFallBackToHeuristicsWhenLocalModelReturnsInvalidJson() {
        ModelGateway gateway = mock(ModelGateway.class);
        ModelSourceRepository sourceRepository = mock(ModelSourceRepository.class);
        UserProfileService profileService = mock(UserProfileService.class);
        ModelSourceProbeService probeService = mock(ModelSourceProbeService.class);
        KnowledgeOrganizerService service =
                new KnowledgeOrganizerService(
                        gateway,
                        sourceRepository,
                        profileService,
                        probeService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        when(profileService.getOrCreate(userId))
                .thenReturn(
                        UserProfile.builder()
                                .userId(userId)
                                .summaryModelSourceId(sourceId)
                                .build());
        when(sourceRepository.selectById(sourceId))
                .thenReturn(localSource(userId, sourceId, "http://127.0.0.1:1234/v1"));
        when(gateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenReturn(new ModelChatResponse("not json", 20, List.of(), "stop"));

        var result =
                service.organize(
                        KnowledgeItem.builder()
                                .userId(userId)
                                .sourceType("snippet")
                                .title("Fallback note")
                                .rawContent("Fallback content remains usable.")
                                .build());

        assertEquals("heuristic_fallback", result.organizationStrategy());
        assertTrue(result.summary().contains("Fallback content"));
        assertTrue(result.tags().contains("snippet"));
    }

    @Test
    void shouldFallBackToHeuristicsWhenLocalModelCallTimesOut() {
        ModelGateway gateway = mock(ModelGateway.class);
        ModelSourceRepository sourceRepository = mock(ModelSourceRepository.class);
        UserProfileService profileService = mock(UserProfileService.class);
        ModelSourceProbeService probeService = mock(ModelSourceProbeService.class);
        KnowledgeOrganizerService service =
                new KnowledgeOrganizerService(
                        gateway,
                        sourceRepository,
                        profileService,
                        probeService,
                        new ObjectMapper());

        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        when(profileService.getOrCreate(userId))
                .thenReturn(
                        UserProfile.builder()
                                .userId(userId)
                                .summaryModelSourceId(sourceId)
                                .build());
        when(sourceRepository.selectById(sourceId))
                .thenReturn(localSource(userId, sourceId, "http://127.0.0.1:1234/v1"));
        when(gateway.chat(eq(ModelProviderType.OPENAI), any()))
                .thenThrow(new RuntimeException("local model timeout"));

        var result =
                service.organize(
                        KnowledgeItem.builder()
                                .userId(userId)
                                .sourceType("snippet")
                                .title("Timeout fallback note")
                                .rawContent("This item remains ready after a local timeout.")
                                .build());

        assertEquals("heuristic_fallback", result.organizationStrategy());
        assertTrue(result.summary().contains("This item remains ready"));
    }

    private ModelSource localSource(UUID userId, UUID sourceId, String baseUrl) {
        return ModelSource.builder()
                .id(sourceId)
                .userId(userId)
                .providerType("local_compatible")
                .name("Local Qwen")
                .baseUrl(baseUrl)
                .apiKey("local-key")
                .defaultModel("qwen-local")
                .lastCheckStatus("ok")
                .enabled(true)
                .build();
    }
}
