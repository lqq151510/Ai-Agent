package com.agent.mvp.tooling.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CodeToolServiceTest {

    @TempDir Path workspaceRoot;

    @Test
    void shouldReadRegularFileInsideWorkspace() throws Exception {
        Files.writeString(workspaceRoot.resolve("README.md"), "hello\nworld\n");

        CodeToolService service = newService();

        CodeToolService.ToolCallOutput output = service.readFile("README.md", 1, 2);

        assertEquals("SUCCESS", output.status());
        assertTrue(output.output().contains("1: hello"));
        assertTrue(output.output().contains("2: world"));
    }

    @Test
    void shouldRejectSymlinkThatEscapesWorkspace() throws Exception {
        Path outsideDir = Files.createTempDirectory("code-tool-outside");
        Path outsideFile = outsideDir.resolve("secret.txt");
        Files.writeString(outsideFile, "secret");
        Files.createSymbolicLink(workspaceRoot.resolve("secret-link.txt"), outsideFile);

        CodeToolService service = newService();

        assertThrows(
                BadRequestException.class, () -> service.readFile("secret-link.txt", 1, 10));
    }

    private CodeToolService newService() {
        AppProperties properties = new AppProperties();
        properties.setWorkspaceRoot(workspaceRoot.toString());
        return new CodeToolService(properties, new ObjectMapper());
    }
}
