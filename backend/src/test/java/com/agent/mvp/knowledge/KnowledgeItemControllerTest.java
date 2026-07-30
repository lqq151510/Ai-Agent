package com.agent.mvp.knowledge;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.ApiExceptionHandler;
import com.agent.mvp.common.exception.ConflictException;
import com.agent.mvp.knowledge.dto.ImportPreflightRequest;
import com.agent.mvp.knowledge.dto.ImportPreflightResponse;
import com.agent.mvp.knowledge.dto.KnowledgeItemPageResponse;
import com.agent.mvp.knowledge.service.KnowledgeItemService;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class KnowledgeItemControllerTest {

    private KnowledgeItemService knowledgeItemService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        knowledgeItemService = mock(KnowledgeItemService.class);
        mockMvc =
                MockMvcBuilders.standaloneSetup(new KnowledgeItemController(knowledgeItemService))
                        .setControllerAdvice(new ApiExceptionHandler())
                        .setMessageConverters(
                                new MappingJackson2HttpMessageConverter(),
                                new StringHttpMessageConverter())
                        .build();
    }

    @Test
    void listItemsShouldBindRepeatedStatusesAndServerSideFilters() throws Exception {
        UUID userId = UUID.randomUUID();
        Instant from = Instant.parse("2026-07-01T00:00:00Z");
        Instant to = Instant.parse("2026-07-29T23:59:59Z");
        List<String> statuses = List.of("inbox", "processing", "failed");
        when(knowledgeItemService.listItems(
                        eq(userId),
                        eq(statuses),
                        eq("markdown"),
                        eq("rag"),
                        eq(from),
                        eq(to),
                        eq(2L),
                        eq(20L)))
                .thenReturn(new KnowledgeItemPageResponse(List.of(), 42, 2, 20));

        mockMvc.perform(
                        get("/api/v1/knowledge-items")
                                .principal(authentication(userId))
                                .param("status", "inbox", "processing", "failed")
                                .param("sourceType", "markdown")
                                .param("tag", "rag")
                                .param("from", from.toString())
                                .param("to", to.toString())
                                .param("page", "2")
                                .param("pageSize", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(42))
                .andExpect(jsonPath("$.page").value(2))
                .andExpect(jsonPath("$.pageSize").value(20));

        verify(knowledgeItemService)
                .listItems(userId, statuses, "markdown", "rag", from, to, 2, 20);
    }

    @Test
    void preflightImportShouldReturnOnlyExistingHashes() throws Exception {
        UUID userId = UUID.randomUUID();
        String existing = "a".repeat(64);
        String missing = "b".repeat(64);
        ImportPreflightRequest request = new ImportPreflightRequest(List.of(existing, missing));
        when(knowledgeItemService.preflightImport(eq(userId), eq(request)))
                .thenReturn(new ImportPreflightResponse(List.of(existing)));

        mockMvc.perform(
                        post("/api/v1/knowledge-items/import/preflight")
                                .principal(authentication(userId))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"contentHashes\":[\""
                                                + existing
                                                + "\",\""
                                                + missing
                                                + "\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.existingContentHashes[0]").value(existing))
                .andExpect(jsonPath("$.sourceUri").doesNotExist())
                .andExpect(jsonPath("$.rawContent").doesNotExist())
                .andExpect(jsonPath("$.existingItemId").doesNotExist());

        verify(knowledgeItemService).preflightImport(userId, request);
    }

    @Test
    void preflightImportShouldRejectMoreThanTwentyHashes() throws Exception {
        UUID userId = UUID.randomUUID();
        String contentHash = "a".repeat(64);
        String hashes = String.join(",", Collections.nCopies(21, "\"" + contentHash + "\""));

        mockMvc.perform(
                        post("/api/v1/knowledge-items/import/preflight")
                                .principal(authentication(userId))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"contentHashes\":[" + hashes + "]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void uploadDuplicateConflictShouldRemainHttp409() throws Exception {
        UUID userId = UUID.randomUUID();
        when(knowledgeItemService.importUpload(eq(userId), any(), eq("notes")))
                .thenThrow(new ConflictException("An identical file has already been imported"));

        mockMvc.perform(
                        multipart("/api/v1/knowledge-items/import/upload")
                                .file(
                                        new MockMultipartFile(
                                                "file",
                                                "notes.md",
                                                "text/markdown",
                                                "same bytes".getBytes()))
                                .param("title", "notes")
                                .principal(authentication(userId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));

        verify(knowledgeItemService).importUpload(eq(userId), any(), eq("notes"));
    }

    private Authentication authentication(UUID userId) {
        return new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(userId, "user@example.com"), null);
    }
}
