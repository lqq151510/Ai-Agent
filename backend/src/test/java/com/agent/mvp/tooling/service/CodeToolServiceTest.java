package com.agent.mvp.tooling.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.config.AppProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CodeToolServiceTest {

    @TempDir Path workspaceRoot;
    @TempDir Path outsideRoot;

    @Test
    void shouldListDefaultTreeWithMinimumDepth() throws Exception {
        Path directory = Files.createDirectory(workspaceRoot.resolve("docs"));
        Files.writeString(directory.resolve("nested.txt"), "nested");

        CodeToolService.ToolCallOutput output = newService().listRepoTree(null, 0);

        assertEquals("SUCCESS", output.status());
        assertTrue(output.output().contains("docs"));
        assertFalse(output.output().contains(Path.of("docs", "nested.txt").toString()));
    }

    @Test
    void shouldClampTreeDepthToFive() throws Exception {
        Path current = workspaceRoot;
        for (String segment : new String[] {"one", "two", "three", "four", "five", "six"}) {
            current = Files.createDirectory(current.resolve(segment));
        }

        CodeToolService.ToolCallOutput output = newService().listRepoTree(".", 99);

        assertEquals("SUCCESS", output.status());
        assertTrue(
                output.output()
                        .contains(Path.of("one", "two", "three", "four", "five").toString()));
        assertFalse(
                output.output()
                        .contains(
                                Path.of("one", "two", "three", "four", "five", "six").toString()));
    }

    @Test
    void shouldUseWorkspaceRootForBlankTreePath() throws Exception {
        Files.writeString(workspaceRoot.resolve("README.md"), "hello");

        CodeToolService.ToolCallOutput output = newService().listRepoTree(" ", 1);

        assertEquals("SUCCESS", output.status());
        assertTrue(output.output().contains("README.md"));
    }

    @Test
    void shouldRejectMissingTreePath() {
        CodeToolService service = newService();

        BadRequestException exception =
                assertThrows(
                        BadRequestException.class,
                        () -> service.listRepoTree("missing-directory", 2));

        assertTrue(exception.getMessage().contains("Path not found"));
    }

    @Test
    void shouldRejectEmptySearchQueries() {
        CodeToolService service = newService();

        CodeToolService.ToolCallOutput nullQuery = service.searchCode(null, null, 10);
        CodeToolService.ToolCallOutput blankQuery = service.searchCode("   ", null, 10);

        assertEquals("ERROR", nullQuery.status());
        assertEquals("Query is empty", nullQuery.output());
        assertEquals("ERROR", blankQuery.status());
        assertEquals("Query is empty", blankQuery.output());
    }

    @Test
    void shouldReturnSearchMatches() throws Exception {
        Files.writeString(workspaceRoot.resolve("Example.java"), "class UniqueSearchNeedle {}\n");

        CodeToolService.ToolCallOutput output =
                newService().searchCode("UniqueSearchNeedle", null, 10);

        assertEquals("SUCCESS", output.status());
        assertTrue(output.output().contains("Example.java:1:class UniqueSearchNeedle"));
    }

    @Test
    void shouldReturnExplicitMessageWhenSearchHasNoMatches() {
        CodeToolService.ToolCallOutput output =
                newService().searchCode("value-that-does-not-exist-7f109d", "", 0);

        assertEquals("SUCCESS", output.status());
        assertEquals("No matches found.", output.output());
    }

    @Test
    void shouldReturnErrorWhenSearchPatternIsInvalid() {
        CodeToolService.ToolCallOutput output = newService().searchCode("[", null, 101);

        assertEquals("ERROR", output.status());
        assertFalse(output.output().isBlank());
    }

    @Test
    void shouldReadRegularFileInsideWorkspace() throws Exception {
        Files.writeString(workspaceRoot.resolve("README.md"), "hello\nworld\n");

        CodeToolService.ToolCallOutput output = newService().readFile("README.md", 1, 2);

        assertEquals("SUCCESS", output.status());
        assertTrue(output.output().contains("1: hello"));
        assertTrue(output.output().contains("2: world"));
    }

    @Test
    void shouldApplyDefaultAndMinimumReadLines() throws Exception {
        Files.writeString(workspaceRoot.resolve("README.md"), "hello\nworld\n");
        CodeToolService service = newService();

        CodeToolService.ToolCallOutput defaultRange = service.readFile("README.md", null, null);
        CodeToolService.ToolCallOutput clampedStart = service.readFile("README.md", 0, 1);

        assertEquals("SUCCESS", defaultRange.status());
        assertEquals("1: hello\n2: world", defaultRange.output());
        assertEquals("1: hello", clampedStart.output());
    }

    @Test
    void shouldTruncateReadRangeToFourHundredLines() throws Exception {
        StringBuilder content = new StringBuilder();
        for (int line = 1; line <= 405; line++) {
            content.append("line-").append(line).append('\n');
        }
        Files.writeString(workspaceRoot.resolve("large.txt"), content);

        CodeToolService.ToolCallOutput output = newService().readFile("large.txt", 1, 1_000);

        assertEquals("SUCCESS", output.status());
        assertTrue(output.argsJson().contains("\"endLine\":400"));
        assertTrue(output.output().contains("400: line-400"));
        assertFalse(output.output().contains("401: line-401"));
    }

    @Test
    void shouldReturnEmptyOutputWhenReadStartsPastEndOfFile() throws Exception {
        Files.writeString(workspaceRoot.resolve("short.txt"), "only one line\n");

        CodeToolService.ToolCallOutput output = newService().readFile("short.txt", 10, 20);

        assertEquals("SUCCESS", output.status());
        assertEquals("", output.output());
    }

    @Test
    void shouldRejectInvalidReadRange() throws Exception {
        Files.writeString(workspaceRoot.resolve("README.md"), "hello\n");
        CodeToolService service = newService();

        BadRequestException exception =
                assertThrows(BadRequestException.class, () -> service.readFile("README.md", 3, 2));

        assertEquals("Invalid line range", exception.getMessage());
    }

    @Test
    void shouldReturnErrorForMissingReadFile() {
        CodeToolService.ToolCallOutput output = newService().readFile("missing.txt", 1, 10);

        assertEquals("ERROR", output.status());
        assertTrue(output.output().contains("readFile failed"));
        assertTrue(output.output().contains("missing.txt"));
    }

    @Test
    void shouldRejectRequiredAndEscapingReadPaths() {
        CodeToolService service = newService();

        assertEquals(
                "Path is required",
                assertThrows(BadRequestException.class, () -> service.readFile(null, 1, 1))
                        .getMessage());
        assertEquals(
                "Path is required",
                assertThrows(BadRequestException.class, () -> service.readFile(" ", 1, 1))
                        .getMessage());
        assertEquals(
                "Path escapes workspace root",
                assertThrows(
                                BadRequestException.class,
                                () -> service.readFile("../outside.txt", 1, 1))
                        .getMessage());
    }

    @Test
    void shouldRejectSymlinkThatEscapesWorkspace() throws Exception {
        Path outsideFile = outsideRoot.resolve("secret.txt");
        Files.writeString(outsideFile, "secret");
        Files.createSymbolicLink(workspaceRoot.resolve("secret-link.txt"), outsideFile);

        CodeToolService service = newService();

        assertThrows(BadRequestException.class, () -> service.readFile("secret-link.txt", 1, 10));
    }

    @Test
    void shouldAnalyzePomAndLimitDependencies() throws Exception {
        StringBuilder pom =
                new StringBuilder("<project><artifactId>demo-app</artifactId><dependencies>");
        for (int dependency = 0; dependency <= 80; dependency++) {
            pom.append("<dependency>");
            if (dependency == 0) {
                pom.append("<groupId>com.example</groupId>");
            }
            pom.append("<artifactId>dep-").append(dependency).append("</artifactId>");
            if (dependency == 0) {
                pom.append("<version>1.0.0</version>");
            }
            pom.append("</dependency>");
        }
        pom.append("</dependencies></project>");
        Files.writeString(workspaceRoot.resolve("pom.xml"), pom);
        CodeToolService service = newService();

        CodeToolService.ToolCallOutput defaultPath = service.analyzePom(null);
        CodeToolService.ToolCallOutput blankPath = service.analyzePom(" ");

        assertEquals("SUCCESS", defaultPath.status());
        assertTrue(defaultPath.output().contains("artifact=demo-app"));
        assertTrue(defaultPath.output().contains("dependencies=80"));
        assertTrue(defaultPath.output().contains("com.example:dep-0:1.0.0"));
        assertTrue(defaultPath.output().contains(":dep-1:"));
        assertFalse(defaultPath.output().contains("dep-80"));
        assertEquals("SUCCESS", blankPath.status());
    }

    @Test
    void shouldUseUnknownArtifactWhenPomHasNoArtifactId() throws Exception {
        Files.writeString(workspaceRoot.resolve("empty-pom.xml"), "<project/>");

        CodeToolService.ToolCallOutput output = newService().analyzePom("empty-pom.xml");

        assertEquals("SUCCESS", output.status());
        assertTrue(output.output().contains("artifact=unknown"));
        assertTrue(output.output().contains("dependencies=0"));
    }

    @Test
    void shouldReturnErrorWhenPomCannotBeRead() {
        CodeToolService.ToolCallOutput output = newService().analyzePom("missing-pom.xml");

        assertEquals("ERROR", output.status());
        assertTrue(output.output().contains("analyzePom failed"));
        assertTrue(output.output().contains("missing-pom.xml"));
    }

    @Test
    void shouldRejectMissingWorkspaceRoot() {
        AppProperties properties = new AppProperties();
        properties.setWorkspaceRoot(workspaceRoot.resolve("missing-workspace").toString());

        IllegalStateException exception =
                assertThrows(
                        IllegalStateException.class,
                        () -> new CodeToolService(properties, new ObjectMapper()));

        assertTrue(exception.getMessage().contains("Workspace root does not exist"));
    }

    @Test
    void shouldFallBackToEmptyJsonWhenArgumentsCannotBeSerialized() {
        CodeToolService service = newService(new FailingObjectMapper());

        CodeToolService.ToolCallOutput output = service.searchCode(" ", null, 1);

        assertEquals("ERROR", output.status());
        assertEquals("{}", output.argsJson());
    }

    private CodeToolService newService() {
        return newService(new ObjectMapper());
    }

    private CodeToolService newService(ObjectMapper objectMapper) {
        AppProperties properties = new AppProperties();
        properties.setWorkspaceRoot(workspaceRoot.toString());
        return new CodeToolService(properties, objectMapper);
    }

    private static final class FailingObjectMapper extends ObjectMapper {

        @Override
        public String writeValueAsString(Object value) throws JsonProcessingException {
            throw new JsonProcessingException("serialization failed") {};
        }
    }
}
