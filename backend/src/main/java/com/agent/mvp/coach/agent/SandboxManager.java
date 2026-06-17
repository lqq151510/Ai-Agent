package com.agent.mvp.coach.agent;

import com.agent.mvp.common.exception.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 代码生成沙箱管理器。
 *
 * <p>为每次 CoderAgent 生成任务创建独立子目录 {@code workspace/coach-runs/{runId}/}，所有写入文件必须落在该
 * 子目录内（通过 {@link Path#normalize()} + {@link Path#startsWith(Path)} 防止路径穿越），并维护
 * {@code .manifest.json} 记录写入的文件清单，支持 {@link #rollback(UUID)} 回滚清理。
 */
@Component
public class SandboxManager {

    private static final Logger log = LoggerFactory.getLogger(SandboxManager.class);
    private static final String MANIFEST_FILE = ".manifest.json";
    private static final String RUNS_SUBDIR = "coach-runs";

    private final Path runsRoot;
    private final ObjectMapper objectMapper;

    public SandboxManager(
            @Value("${WORKSPACE_ROOT:/app/workspace}") String workspaceRoot,
            ObjectMapper objectMapper) {
        this.runsRoot =
                Paths.get(workspaceRoot).toAbsolutePath().normalize().resolve(RUNS_SUBDIR);
        this.objectMapper = objectMapper;
    }

    /** 测试用：直接指定 runsRoot。 */
    SandboxManager(Path runsRoot, ObjectMapper objectMapper) {
        this.runsRoot = runsRoot.toAbsolutePath().normalize();
        this.objectMapper = objectMapper;
    }

    /** 返回指定 runId 对应的沙箱目录（不创建）。 */
    public Path sandboxRoot(UUID runId) {
        if (runId == null) {
            throw new BadRequestException("runId must not be null");
        }
        return runsRoot.resolve(runId.toString()).toAbsolutePath().normalize();
    }

    /**
     * 在沙箱内写入一个文件，相对路径 {@code relativePath} 不能逃逸出 runId 子目录。
     *
     * @return 写入后的绝对路径
     */
    public Path writeFile(UUID runId, String relativePath, String content) {
        Path target = resolveSafe(runId, relativePath);
        try {
            Files.createDirectories(target.getParent());
            Files.writeString(target, content, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new BadRequestException("Failed to write sandbox file: " + ex.getMessage());
        }
        appendToManifest(runId, relativePath);
        log.debug("SandboxManager wrote file {} for run {}", relativePath, runId);
        return target;
    }

    /** 读取沙箱内文件内容。 */
    public String readFile(UUID runId, String relativePath) {
        Path target = resolveSafe(runId, relativePath);
        try {
            return Files.readString(target, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new BadRequestException("Failed to read sandbox file: " + ex.getMessage());
        }
    }

    /** 列出该 runId 沙箱内已写入的文件相对路径（基于 manifest）。 */
    public List<String> listFiles(UUID runId) {
        Path manifest = sandboxRoot(runId).resolve(MANIFEST_FILE);
        if (!Files.exists(manifest)) {
            return Collections.emptyList();
        }
        try {
            Map<?, ?> data = objectMapper.readValue(manifest.toFile(), Map.class);
            Object files = data.get("files");
            if (files instanceof List<?> list) {
                List<String> out = new ArrayList<>();
                for (Object o : list) {
                    if (o instanceof Map<?, ?> m && m.get("path") instanceof String p) {
                        out.add(p);
                    }
                }
                return out;
            }
        } catch (IOException ex) {
            log.warn("Failed to read manifest for run {}: {}", runId, ex.getMessage());
        }
        return Collections.emptyList();
    }

    /**
     * 回滚指定 runId：删除该子目录下所有文件与目录本身。
     *
     * @return 已删除的文件数量
     */
    public int rollback(UUID runId) {
        Path root = sandboxRoot(runId);
        if (!Files.exists(root)) {
            log.info("Sandbox rollback: run {} directory does not exist, skip", runId);
            return 0;
        }
        final int[] deleted = {0};
        try {
            Files.walkFileTree(
                    root,
                    new SimpleFileVisitor<>() {
                        @Override
                        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs)
                                throws IOException {
                            Files.delete(file);
                            deleted[0]++;
                            return FileVisitResult.CONTINUE;
                        }

                        @Override
                        public FileVisitResult postVisitDirectory(Path dir, IOException exc)
                                throws IOException {
                            Files.delete(dir);
                            return FileVisitResult.CONTINUE;
                        }
                    });
        } catch (IOException ex) {
            throw new BadRequestException("Failed to rollback sandbox: " + ex.getMessage());
        }
        log.info("Sandbox rollback: deleted {} files for run {}", deleted[0], runId);
        return deleted[0];
    }

    /**
     * 校验相对路径不会逃逸出 runId 子目录。 使用 normalize() 消除 {@code ..} 后用 startsWith 判定，同时
     * 对原始路径字符串中的 {@code ..} 段做严格拦截（兼容 Windows 反斜杠场景）。
     */
    private Path resolveSafe(UUID runId, String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            throw new BadRequestException("Sandbox file path is empty");
        }
        // 先对原始字符串做严格检查：任何 ".." 段（无论正斜杠还是反斜杠分隔）都直接拒绝
        // 这样可以在 normalize 之前就拦截 Windows 风格的路径穿越尝试
        String normalizedSeparators = relativePath.replace('\\', '/');
        String[] segments = normalizedSeparators.split("/");
        for (String segment : segments) {
            if ("..".equals(segment)) {
                throw new BadRequestException(
                        "Sandbox file path contains parent reference: " + relativePath);
            }
        }
        Path root = sandboxRoot(runId);
        Path resolved = root.resolve(relativePath).normalize();
        if (!resolved.startsWith(root)) {
            throw new BadRequestException(
                    "Sandbox file path escapes run directory: " + relativePath);
        }
        if (resolved.equals(root)) {
            throw new BadRequestException("Sandbox file path must not be the run directory itself");
        }
        return resolved;
    }

    /** 追加一条记录到 manifest（若不存在则创建）。 */
    @SuppressWarnings("unchecked")
    private void appendToManifest(UUID runId, String relativePath) {
        Path root = sandboxRoot(runId);
        Path manifest = root.resolve(MANIFEST_FILE);
        try {
            Files.createDirectories(root);
            Map<String, Object> data;
            if (Files.exists(manifest)) {
                data = objectMapper.readValue(manifest.toFile(), Map.class);
            } else {
                data = new LinkedHashMap<>();
                data.put("runId", runId.toString());
                data.put("files", new ArrayList<>());
            }
            Object filesObj = data.get("files");
            List<Object> files =
                    filesObj instanceof List<?> list ? new ArrayList<>(list) : new ArrayList<>();
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("path", relativePath);
            entry.put("createdAt", java.time.Instant.now().toString());
            files.add(entry);
            data.put("files", files);
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(manifest.toFile(), data);
        } catch (IOException ex) {
            log.warn("Failed to update manifest for run {}: {}", runId, ex.getMessage());
        }
    }
}
