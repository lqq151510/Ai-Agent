package com.agent.mvp.agent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.agent.mvp.config.AppProperties;
import com.agent.mvp.session.dto.MessageResponse;
import com.agent.mvp.session.entity.ConversationSession;
import com.agent.mvp.agent.service.AgentContextService.HistoryWindow;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AgentContextServiceTest {

    @Mock
    private RAGMemoryService ragMemoryService;

    @Mock
    private AppProperties appProperties;

    @Mock
    private AppProperties.Agent agentProperties;

    private AgentContextService contextService;

    @BeforeEach
    void setUp() {
        contextService = new AgentContextService(ragMemoryService, appProperties);
    }

    @Test
    void testResolveContextTokenBudget() {
        when(appProperties.getAgent()).thenReturn(agentProperties);
        // Test user provided override
        ConversationSession session = new ConversationSession();
        assertEquals(800, contextService.resolveContextTokenBudget(800, session));

        // Test session fallback
        session.setContextTokenLimit(600);
        assertEquals(600, contextService.resolveContextTokenBudget(null, session));

        // Test app properties fallback
        when(agentProperties.getMaxContextTokens()).thenReturn(700);
        assertEquals(700, contextService.resolveContextTokenBudget(null, new ConversationSession()));

        // Test minimum limit (500)
        assertEquals(500, contextService.resolveContextTokenBudget(100, session));
    }

    @Test
    void testBuildMessagesSanitization() {
        UUID userId = UUID.randomUUID();
        when(ragMemoryService.searchSimilarDiagnoses(eq(userId), anyString(), anyInt())).thenReturn(List.of());

        String dirtyContext = "This is a context with a Bearer abcdef12345 inside.\n"
                + "Also my sk-1234567890abcdef is hidden.";

        MessageResponse msg = new MessageResponse(UUID.randomUUID(), "user", "Hello", "{}", null, null, Instant.now());
        
        HistoryWindow window = contextService.buildMessages(userId, List.of(msg), 4000, dirtyContext);

        String systemPrompt = window.messages().get(0).content();
        
        assertTrue(systemPrompt.contains("Bearer [redacted]"));
        assertTrue(systemPrompt.contains("sk-[redacted]"));
        assertFalse(systemPrompt.contains("abcdef12345"));
        assertFalse(systemPrompt.contains("1234567890abcdef"));
    }

    @Test
    void testBuildMessagesTruncation() {
        UUID userId = UUID.randomUUID();
        when(ragMemoryService.searchSimilarDiagnoses(eq(userId), anyString(), anyInt())).thenReturn(List.of());

        // Create a long history
        MessageResponse m1 = new MessageResponse(UUID.randomUUID(), "user", "Message 1 ".repeat(100), "{}", null, null, Instant.now());
        MessageResponse m2 = new MessageResponse(UUID.randomUUID(), "assistant", "Message 2 ".repeat(100), "{}", null, null, Instant.now());
        MessageResponse m3 = new MessageResponse(UUID.randomUUID(), "user", "Message 3 ".repeat(100), "{}", null, null, Instant.now());

        // Low token budget to force truncation
        HistoryWindow window = contextService.buildMessages(userId, List.of(m1, m2, m3), 500, "");

        assertTrue(window.historyTruncated());
        // System message + truncated history
        assertTrue(window.messages().size() < 4);
    }
}
