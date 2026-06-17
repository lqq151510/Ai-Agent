package com.agent.mvp.coach.service;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.coach.domain.GeneratedScaffold;
import com.agent.mvp.coach.domain.ScaffoldFile;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.NotFoundException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipFile;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ScaffoldZipServiceTest {

    private final ScaffoldZipService zipService = new ScaffoldZipService();

    @TempDir Path artifactRoot;

    @Test
    void shouldWriteZipWithProjectRootEntries() throws Exception {
        UUID runId = UUID.randomUUID();
        var scaffold =
                new GeneratedScaffold(
                        "spring-boot-agent-basic",
                        "coach-demo",
                        List.of(new ScaffoldFile("README.md", "# demo")),
                        List.of("mvn -q test"));

        var zipPath = zipService.writeZip(runId, scaffold);

        assertTrue(zipPath.getFileName().toString().contains(runId.toString()));
        try (ZipFile zip = new ZipFile(zipPath.toFile())) {
            assertNotNull(zip.getEntry("coach-demo/README.md"));
        }
    }

    @Test
    void shouldRejectEscapingFilePath() {
        var scaffold =
                new GeneratedScaffold(
                        "spring-boot-agent-basic",
                        "coach-demo",
                        List.of(new ScaffoldFile("../secret.txt", "nope")),
                        List.of());

        assertThrows(
                BadRequestException.class, () -> zipService.writeZip(UUID.randomUUID(), scaffold));
    }

    @Test
    void shouldRejectStoredArtifactSymlinkThatEscapesRoot() throws Exception {
        Path outsideDir = Files.createTempDirectory("coach-artifact-outside");
        Path outsideFile = outsideDir.resolve("escape.zip");
        Files.writeString(outsideFile, "not owned");
        Path symlink = artifactRoot.resolve("escape.zip");
        Files.createSymbolicLink(symlink, outsideFile);

        ScaffoldZipService scopedZipService = new ScaffoldZipService(artifactRoot);

        assertThrows(
                NotFoundException.class,
                () -> scopedZipService.resolveOwnedArtifact(symlink.toString()));
    }
}
