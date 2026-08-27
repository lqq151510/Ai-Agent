package com.agent.mvp.agent.tooling;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.agent.mvp.tooling.service.CodeToolService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
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

    @Test
    void listToolSpecsShouldBeEmptyWhenCodeToolsAreUnavailable() {
        AgentToolOrchestrator orchestrator =
                new AgentToolOrchestrator(Optional.empty(), new ObjectMapper());

        assertTrue(orchestrator.listToolSpecs().isEmpty());
    }

    @Test
    void executeShouldRejectCallsWhenCodeToolsAreUnavailable() {
        AgentToolOrchestrator orchestrator =
                new AgentToolOrchestrator(Optional.empty(), new ObjectMapper());

        ToolResult result =
                orchestrator
                        .execute(
                                new ToolCall("call-1", null, null),
                                ignored -> CompletableFuture.completedFuture("unused"))
                        .join();

        assertEquals("", result.toolName());
        assertEquals("ERROR", result.status());
        assertEquals("Tool not available in this profile", result.output());
    }

    @Test
    void executeShouldDelegateBuiltInToolsWithNormalizedArguments() {
        CodeToolService codeTools = mock(CodeToolService.class);
        AgentToolOrchestrator orchestrator =
                new AgentToolOrchestrator(Optional.of(codeTools), new ObjectMapper());
        when(codeTools.searchCode("needle", "*.java", 12))
                .thenReturn(output("searchCode", "found"));
        when(codeTools.readFile("README.md", 2, 8)).thenReturn(output("readFile", "lines"));
        when(codeTools.listRepoTree(".", 3)).thenReturn(output("listRepoTree", "tree"));
        when(codeTools.analyzePom("pom.xml")).thenReturn(output("analyzePom", "pom"));

        ToolResult search =
                orchestrator
                        .execute(
                                new ToolCall(
                                        "search",
                                        "searchCode",
                                        "{\"query\":\"needle\",\"glob\":\"*.java\",\"maxResults\":12}"),
                                ignored -> CompletableFuture.completedFuture("unused"))
                        .join();
        ToolResult read =
                orchestrator
                        .execute(
                                new ToolCall(
                                        "read",
                                        "readFile",
                                        "{\"path\":\"README.md\",\"startLine\":2,\"endLine\":8}"),
                                ignored -> CompletableFuture.completedFuture("unused"))
                        .join();
        ToolResult tree =
                orchestrator
                        .execute(
                                new ToolCall(
                                        "tree", "listRepoTree", "{\"path\":\"  \",\"depth\":null}"),
                                ignored -> CompletableFuture.completedFuture("unused"))
                        .join();
        ToolResult pom =
                orchestrator
                        .execute(
                                new ToolCall("pom", "analyzePom", "not-json"),
                                ignored -> CompletableFuture.completedFuture("unused"))
                        .join();

        assertEquals("found", search.output());
        assertEquals("lines", read.output());
        assertEquals("tree", tree.output());
        assertEquals("pom", pom.output());
        verify(codeTools).searchCode("needle", "*.java", 12);
        verify(codeTools).readFile("README.md", 2, 8);
        verify(codeTools).listRepoTree(".", 3);
        verify(codeTools).analyzePom("pom.xml");
    }

    @Test
    void executeShouldUseDefaultsForMissingOptionalArguments() {
        CodeToolService codeTools = mock(CodeToolService.class);
        AgentToolOrchestrator orchestrator =
                new AgentToolOrchestrator(Optional.of(codeTools), new ObjectMapper());
        when(codeTools.searchCode(isNull(), isNull(), eq(40)))
                .thenReturn(output("searchCode", "empty query"));
        when(codeTools.readFile(isNull(), isNull(), isNull()))
                .thenReturn(output("readFile", "empty path"));

        orchestrator
                .execute(
                        new ToolCall("search", "searchCode", ""),
                        ignored -> CompletableFuture.completedFuture("unused"))
                .join();
        orchestrator
                .execute(
                        new ToolCall("read", "readFile", "{\"path\":null}"),
                        ignored -> CompletableFuture.completedFuture("unused"))
                .join();

        verify(codeTools).searchCode(isNull(), isNull(), eq(40));
        verify(codeTools).readFile(isNull(), isNull(), isNull());
    }

    @Test
    void executeShouldHandleClientToolSuccessAndReportedError() {
        CodeToolService codeTools = mock(CodeToolService.class);
        AgentToolOrchestrator orchestrator =
                new AgentToolOrchestrator(Optional.of(codeTools), new ObjectMapper());

        ToolResult success =
                orchestrator
                        .execute(
                                new ToolCall("cli", "execute_cli_command", "{}"),
                                ignored -> CompletableFuture.completedFuture("done"))
                        .join();
        ToolResult reportedError =
                orchestrator
                        .execute(
                                new ToolCall("computer", "computer_use", "{}"),
                                ignored -> CompletableFuture.completedFuture("ERROR: denied"))
                        .join();

        assertEquals("SUCCESS", success.status());
        assertEquals("done", success.output());
        assertEquals("ERROR", reportedError.status());
        assertEquals("ERROR: denied", reportedError.output());
    }

    @Test
    void executeShouldHandleClientToolAsyncAndSynchronousFailures() {
        CodeToolService codeTools = mock(CodeToolService.class);
        AgentToolOrchestrator orchestrator =
                new AgentToolOrchestrator(Optional.of(codeTools), new ObjectMapper());

        ToolResult asyncFailure =
                orchestrator
                        .execute(
                                new ToolCall("cli", "execute_cli_command", "{}"),
                                ignored ->
                                        CompletableFuture.failedFuture(
                                                new IllegalStateException("offline")))
                        .join();
        ToolResult syncFailure =
                orchestrator
                        .execute(
                                new ToolCall("computer", "computer_use", "{}"),
                                ignored -> {
                                    throw new IllegalArgumentException("blocked");
                                })
                        .join();

        assertEquals("ERROR", asyncFailure.status());
        assertTrue(asyncFailure.output().contains("offline"));
        assertEquals("ERROR", syncFailure.status());
        assertEquals("ERROR: blocked", syncFailure.output());
    }

    @Test
    void executeShouldLoadAvailableSkillAndReportUnknownSkill() throws Exception {
        CodeToolService codeTools = mock(CodeToolService.class);
        AgentToolOrchestrator orchestrator =
                new AgentToolOrchestrator(Optional.of(codeTools), new ObjectMapper());
        Path skillsRoot = Path.of(".agents", "skills");
        Path agentsRoot = skillsRoot.getParent();
        boolean agentsRootExisted = Files.exists(agentsRoot);
        boolean skillsRootExisted = Files.exists(skillsRoot);
        Files.createDirectories(skillsRoot);
        Path skillDir = Files.createTempDirectory(skillsRoot, "orchestrator-test-");
        String skillName = skillDir.getFileName().toString();
        Files.writeString(
                skillDir.resolve("SKILL.md"),
                "---\n"
                        + "name: test-skill\n"
                        + "description: Test skill\n"
                        + "---\n"
                        + "Follow the test instructions.\n");
        Path scriptsDir = Files.createDirectory(skillDir.resolve("scripts"));
        Files.writeString(scriptsDir.resolve("verify.sh"), "#!/bin/sh\n");

        try {
            ToolResult loaded =
                    orchestrator
                            .execute(
                                    new ToolCall(
                                            "skill",
                                            "runSkill",
                                            "{\"name\":\""
                                                    + skillName
                                                    + "\",\"params\":\"focus tests\"}"),
                                    ignored -> CompletableFuture.completedFuture("unused"))
                            .join();
            ToolResult missing =
                    orchestrator
                            .execute(
                                    new ToolCall("missing", "definitely-missing-skill", null),
                                    ignored -> CompletableFuture.completedFuture("unused"))
                            .join();

            assertEquals("SUCCESS", loaded.status());
            assertTrue(loaded.output().contains("SKILL.md loaded successfully"));
            assertTrue(loaded.output().contains("Skill parameters: focus tests"));
            assertTrue(loaded.output().contains("verify.sh"));
            assertEquals("ERROR", missing.status());
            assertTrue(missing.output().contains("Unknown tool or skill not found"));
        } finally {
            try (var paths = Files.walk(skillDir)) {
                paths.sorted(Comparator.reverseOrder())
                        .forEach(
                                path -> {
                                    try {
                                        Files.deleteIfExists(path);
                                    } catch (java.io.IOException ex) {
                                        throw new java.io.UncheckedIOException(ex);
                                    }
                                });
            }
            if (!skillsRootExisted) {
                Files.deleteIfExists(skillsRoot);
            }
            if (!agentsRootExisted) {
                Files.deleteIfExists(agentsRoot);
            }
        }
    }

    private static CodeToolService.ToolCallOutput output(String toolName, String value) {
        return new CodeToolService.ToolCallOutput(toolName, "{}", "SUCCESS", 1, value);
    }
}
