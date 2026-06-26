package com.agent.mvp.knowledge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.knowledge.entity.KnowledgeItem;
import org.junit.jupiter.api.Test;

class KnowledgeOrganizerServiceTest {

    @Test
    void shouldOrganizeSnippetIntoSummaryLanguageAndTags() {
        KnowledgeOrganizerService service = new KnowledgeOrganizerService();
        KnowledgeItem item =
                KnowledgeItem.builder()
                        .sourceType("snippet")
                        .title("Spring AI RAG notes")
                        .rawContent("Spring AI helps build RAG pipelines with retrieval and generation.")
                        .build();

        var result = service.organize(item);

        assertEquals("en", result.language());
        assertTrue(result.wordCount() > 5);
        assertTrue(result.summary().contains("Spring AI"));
        assertTrue(result.tags().contains("snippet"));
        assertFalse(result.tags().isEmpty());
    }
}
