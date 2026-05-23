package com.agent.mvp.coach.service;

import com.agent.mvp.coach.domain.GeneratedScaffold;
import com.agent.mvp.coach.domain.ScaffoldFile;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.NotFoundException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class ScaffoldZipService {

    private final Path artifactRoot = Paths.get("var", "coach-artifacts").toAbsolutePath().normalize();

    public Path writeZip(UUID runId, GeneratedScaffold scaffold) {
        try {
            Files.createDirectories(artifactRoot);
            Path zipPath = artifactRoot.resolve(runId + "-" + scaffold.projectName() + ".zip").normalize();
            if (!zipPath.startsWith(artifactRoot)) {
                throw new BadRequestException("Invalid scaffold artifact path");
            }
            try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(zipPath), StandardCharsets.UTF_8)) {
                for (ScaffoldFile file : scaffold.files()) {
                    addFile(zip, scaffold.projectName(), file);
                }
            }
            return zipPath;
        } catch (IOException ex) {
            throw new BadRequestException("Failed to write scaffold zip: " + ex.getMessage());
        }
    }

    public Path resolveOwnedArtifact(String storedPath) {
        if (storedPath == null || storedPath.isBlank()) {
            throw new NotFoundException("Scaffold artifact not found");
        }
        Path path = Paths.get(storedPath).toAbsolutePath().normalize();
        if (!path.startsWith(artifactRoot) || !Files.exists(path)) {
            throw new NotFoundException("Scaffold artifact not found");
        }
        return path;
    }

    private void addFile(ZipOutputStream zip, String projectName, ScaffoldFile file) throws IOException {
        String relative = sanitize(file.path());
        ZipEntry entry = new ZipEntry(projectName + "/" + relative);
        zip.putNextEntry(entry);
        zip.write(file.content().getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private String sanitize(String path) {
        if (path == null || path.isBlank()) {
            throw new BadRequestException("Scaffold file path is empty");
        }
        Path normalized = Paths.get(path).normalize();
        if (normalized.isAbsolute() || normalized.startsWith("..")) {
            throw new BadRequestException("Scaffold file path escapes project root");
        }
        return normalized.toString().replace('\\', '/');
    }
}
