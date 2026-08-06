package com.agent.mvp.knowledge;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.ApiExceptionHandler;
import com.agent.mvp.knowledge.review.KnowledgeReviewService;
import com.agent.mvp.knowledge.review.dto.CompleteKnowledgeReviewRequest;
import com.agent.mvp.knowledge.review.dto.KnowledgeReviewQueueResponse;
import com.agent.mvp.knowledge.review.dto.KnowledgeReviewStateResponse;
import com.agent.mvp.knowledge.review.dto.KnowledgeReviewSummaryResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class KnowledgeReviewControllerTest {

    private KnowledgeReviewService reviewService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        reviewService = mock(KnowledgeReviewService.class);
        mockMvc =
                MockMvcBuilders.standaloneSetup(new KnowledgeReviewController(reviewService))
                        .setControllerAdvice(new ApiExceptionHandler())
                        .setMessageConverters(
                                new MappingJackson2HttpMessageConverter(),
                                new StringHttpMessageConverter())
                        .build();
    }

    @Test
    void queueAndSummaryUseAuthenticatedUserOnly() throws Exception {
        UUID userId = UUID.randomUUID();
        when(reviewService.getQueue(userId, 7)).thenReturn(new KnowledgeReviewQueueResponse(List.of(), 0));
        when(reviewService.getSummary(userId))
                .thenReturn(new KnowledgeReviewSummaryResponse(0, Instant.parse("2026-08-06T12:00:00Z")));

        mockMvc.perform(get("/api/v1/knowledge-reviews/queue").param("limit", "7").principal(authentication(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.rawContent").doesNotExist());
        mockMvc.perform(get("/api/v1/knowledge-reviews/summary").principal(authentication(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dueCount").value(0));

        verify(reviewService).getQueue(userId, 7);
        verify(reviewService).getSummary(userId);
    }

    @Test
    void completeForwardsOnlyItemIdAndClosedRequestBody() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();
        Instant dueAt = Instant.parse("2026-08-07T12:00:00Z");
        CompleteKnowledgeReviewRequest request = new CompleteKnowledgeReviewRequest("good");
        when(reviewService.complete(eq(userId), eq(itemId), eq(request)))
                .thenReturn(new KnowledgeReviewStateResponse(itemId, "good", dueAt, 1, 2.5, 1));

        mockMvc.perform(
                        post("/api/v1/knowledge-reviews/{itemId}/complete", itemId)
                                .principal(authentication(userId))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"rating\":\"good\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.knowledgeItemId").value(itemId.toString()))
                .andExpect(jsonPath("$.rating").value("good"))
                .andExpect(jsonPath("$.rawContent").doesNotExist())
                .andExpect(jsonPath("$.sourceUri").doesNotExist());

        verify(reviewService).complete(userId, itemId, request);
    }

    private Authentication authentication(UUID userId) {
        return new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(userId, "user@example.com"), null);
    }
}
