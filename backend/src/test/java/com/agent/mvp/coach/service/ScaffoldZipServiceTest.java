package com.agent.mvp.coach.service;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.coach.domain.GeneratedScaffold;
import com.agent.mvp.coach.domain.ScaffoldFile;
import com.agent.mvp.common.exception.BadRequestException;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipFile;
import org.junit.jupiter.api.Test;

class ScaffoldZipServiceTest {

    private final ScaffoldZipService zipService = new ScaffoldZipService();

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
}
