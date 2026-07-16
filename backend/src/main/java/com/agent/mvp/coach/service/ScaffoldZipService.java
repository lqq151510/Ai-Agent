package com.agent.mvp.coach.service;

import com.agent.mvp.coach.domain.GeneratedScaffold;
import com.agent.mvp.coach.domain.ScaffoldFile;
import com.agent.mvp.common.exception.BadRequestException;
import com.agent.mvp.common.exception.NotFoundException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.springframework.stereotype.Service;

@org.springframework.context.annotation.Profile("legacy")
@Service
public class ScaffoldZipService {

    private final Path artifactRoot;

    public ScaffoldZipService() {
        this(Paths.get("var", "coach-artifacts"));
    }

    ScaffoldZipService(Path artifactRoot) {
        this.artifactRoot = artifactRoot.toAbsolutePath().normalize();
    }

    public Path writeZip(UUID runId, GeneratedScaffold scaffold) {
        try {
            Path realArtifactRoot = ensureArtifactRoot();
            Path zipPath =
                    realArtifactRoot
                            .resolve(runId + "-" + scaffold.projectName() + ".zip")
                            .normalize();
            if (!zipPath.startsWith(realArtifactRoot)) {
                throw new BadRequestException("Invalid scaffold artifact path");
            }
            try (ZipOutputStream zip =
                    new ZipOutputStream(Files.newOutputStream(zipPath), StandardCharsets.UTF_8)) {
                for (ScaffoldFile file : scaffold.files()) {
                    addFile(zip, scaffold.projectName(), file);
                }
            }
            return zipPath;
        } catch (IOException ex) {
            throw new BadRequestException("Failed to write scaffold zip: " + ex.getMessage());
        }
    }

    /**
     * 从沙箱目录打包所有文件（排除 manifest 等隐藏文件）为 ZIP。
     *
     * <p>用于 CoderAgent 沙箱产物归档：将 {@code sandboxRoot} 下的文件按相对路径打包，ZIP 内顶层目录为 {@code projectName}。
     *
     * @param runId 沙箱运行 ID
     * @param sandboxRoot 沙箱根目录（必须存在且可读）
     * @param projectName ZIP 内顶层目录名
     * @return 生成的 ZIP 文件绝对路径
     */
    public Path writeZipFromSandbox(UUID runId, Path sandboxRoot, String projectName) {
        if (sandboxRoot == null || !Files.isDirectory(sandboxRoot)) {
            throw new NotFoundException("Sandbox directory not found for run " + runId);
        }
        Path safeRoot = sandboxRoot.toAbsolutePath().normalize();
        try {
            Path realArtifactRoot = ensureArtifactRoot();
            Path zipPath =
                    realArtifactRoot
                            .resolve(runId + "-" + sanitizeProjectName(projectName) + ".zip")
                            .normalize();
            if (!zipPath.startsWith(realArtifactRoot)) {
                throw new BadRequestException("Invalid scaffold artifact path");
            }
            try (ZipOutputStream zip =
                    new ZipOutputStream(Files.newOutputStream(zipPath), StandardCharsets.UTF_8)) {
                Files.walkFileTree(
                        safeRoot,
                        new SimpleFileVisitor<>() {
                            @Override
                            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs)
                                    throws IOException {
                                Path relative = safeRoot.relativize(file);
                                String relativeStr = relative.toString().replace('\\', '/');
                                // 跳过 manifest 等隐藏文件
                                if (relativeStr.startsWith(".")) {
                                    return FileVisitResult.CONTINUE;
                                }
                                ZipEntry entry = new ZipEntry(projectName + "/" + relativeStr);
                                zip.putNextEntry(entry);
                                zip.write(Files.readAllBytes(file));
                                zip.closeEntry();
                                return FileVisitResult.CONTINUE;
                            }
                        });
            }
            return zipPath;
        } catch (IOException ex) {
            throw new BadRequestException("Failed to write sandbox zip: " + ex.getMessage());
        }
    }

    public Path resolveOwnedArtifact(String storedPath) {
        if (storedPath == null || storedPath.isBlank()) {
            throw new NotFoundException("Scaffold artifact not found");
        }
        try {
            Path realArtifactRoot = ensureArtifactRoot();
            Path path = Paths.get(storedPath).toAbsolutePath().normalize().toRealPath();
            if (!path.startsWith(realArtifactRoot)) {
                throw new NotFoundException("Scaffold artifact not found");
            }
            return path;
        } catch (IOException | IllegalArgumentException ex) {
            throw new NotFoundException("Scaffold artifact not found");
        }
    }

    private void addFile(ZipOutputStream zip, String projectName, ScaffoldFile file)
            throws IOException {
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

    private String sanitizeProjectName(String projectName) {
        if (projectName == null || projectName.isBlank()) {
            return "coach-run";
        }
        String cleaned = projectName.replaceAll("[^a-zA-Z0-9._-]", "-");
        return cleaned.isBlank() ? "coach-run" : cleaned;
    }

    private Path ensureArtifactRoot() throws IOException {
        Files.createDirectories(artifactRoot);
        return artifactRoot.toRealPath();
    }
}
