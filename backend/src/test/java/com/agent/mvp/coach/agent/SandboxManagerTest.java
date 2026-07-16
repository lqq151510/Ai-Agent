package com.agent.mvp.coach.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.common.exception.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** {@link SandboxManager} 单元测试，覆盖正常写入读取、路径穿越攻击拒绝、rollback 清理彻底三类场景。 */
class SandboxManagerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @TempDir Path workspaceRoot;

    private SandboxManager newManager() {
        return new SandboxManager(workspaceRoot.resolve("coach-runs"), objectMapper);
    }

    @Test
    void shouldWriteAndReadFileInSandbox() {
        SandboxManager manager = newManager();
        UUID runId = UUID.randomUUID();

        Path written = manager.writeFile(runId, "src/Main.java", "public class Main {}");
        assertTrue(Files.exists(written), "写入的文件应存在");
        assertTrue(
                written.startsWith(workspaceRoot.resolve("coach-runs").resolve(runId.toString())),
                "文件应落在 runId 子目录内");

        String content = manager.readFile(runId, "src/Main.java");
        assertEquals("public class Main {}", content);

        List<String> files = manager.listFiles(runId);
        assertEquals(1, files.size(), "manifest 应记录 1 个文件");
        assertEquals("src/Main.java", files.get(0));
    }

    @Test
    void shouldWriteMultipleFilesAndTrackInManifest() {
        SandboxManager manager = newManager();
        UUID runId = UUID.randomUUID();

        manager.writeFile(runId, "a.txt", "A");
        manager.writeFile(runId, "sub/b.txt", "B");

        List<String> files = manager.listFiles(runId);
        assertEquals(2, files.size(), "manifest 应记录 2 个文件");
        assertTrue(files.contains("a.txt"));
        assertTrue(files.contains("sub/b.txt"));
    }

    @Test
    void shouldRejectPathTraversalAttack() {
        SandboxManager manager = newManager();
        UUID runId = UUID.randomUUID();

        // 经典路径穿越：尝试逃逸到 runId 子目录之外
        assertThrows(
                BadRequestException.class,
                () -> manager.writeFile(runId, "../../../etc/passwd", "malicious"),
                "../../../etc/passwd 应被拒绝");

        assertThrows(
                BadRequestException.class,
                () -> manager.writeFile(runId, "..\\..\\..\\windows\\system32\\config\\sam", "x"),
                "Windows 风格路径穿越应被拒绝");

        // 绝对路径也应被拒绝
        assertThrows(
                BadRequestException.class,
                () -> manager.writeFile(runId, "/etc/passwd", "x"),
                "绝对路径应被拒绝");
    }

    @Test
    void shouldRejectEmptyPath() {
        SandboxManager manager = newManager();
        UUID runId = UUID.randomUUID();

        assertThrows(BadRequestException.class, () -> manager.writeFile(runId, "", "x"));
        assertThrows(BadRequestException.class, () -> manager.writeFile(runId, "   ", "x"));
    }

    @Test
    void shouldRejectNullRunId() {
        SandboxManager manager = newManager();
        assertThrows(BadRequestException.class, () -> manager.sandboxRoot(null));
    }

    @Test
    void rollbackShouldRemoveAllFilesAndDirectory() {
        SandboxManager manager = newManager();
        UUID runId = UUID.randomUUID();

        manager.writeFile(runId, "file1.txt", "content1");
        manager.writeFile(runId, "dir/file2.txt", "content2");
        Path sandboxDir = manager.sandboxRoot(runId);
        assertTrue(Files.exists(sandboxDir), "沙箱目录应存在");

        int deleted = manager.rollback(runId);
        assertEquals(3, deleted, "应删除 3 个文件（含 .manifest.json）");
        assertFalse(Files.exists(sandboxDir), "rollback 后沙箱目录应被彻底删除");
    }

    @Test
    void rollbackShouldBeIdempotentForMissingRun() {
        SandboxManager manager = newManager();
        UUID runId = UUID.randomUUID();
        // 未写入任何文件，rollback 不应抛异常
        int deleted = manager.rollback(runId);
        assertEquals(0, deleted, "不存在的 run rollback 应返回 0");
    }

    @Test
    void differentRunsShouldBeIsolated() {
        SandboxManager manager = newManager();
        UUID run1 = UUID.randomUUID();
        UUID run2 = UUID.randomUUID();

        manager.writeFile(run1, "shared.txt", "from-run1");
        manager.writeFile(run2, "shared.txt", "from-run2");

        assertEquals("from-run1", manager.readFile(run1, "shared.txt"));
        assertEquals("from-run2", manager.readFile(run2, "shared.txt"));

        // 回滚 run1 不影响 run2
        manager.rollback(run1);
        assertEquals("from-run2", manager.readFile(run2, "shared.txt"));
        assertFalse(Files.exists(manager.sandboxRoot(run1)));
    }
}
