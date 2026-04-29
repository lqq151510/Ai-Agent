package com.agent.cli.client;

import com.agent.cli.model.AuthState;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Set;

public class CliStateStore {

    private static final Path STATE_DIR = Path.of(System.getProperty("user.home"), ".ai-agent-cli");
    private static final Path STATE_FILE = STATE_DIR.resolve("state.json");

    private final ObjectMapper objectMapper;

    public CliStateStore(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public AuthState read() {
        if (!Files.exists(STATE_FILE)) {
            return new AuthState();
        }

        try {
            return objectMapper.readValue(Files.readString(STATE_FILE), AuthState.class);
        } catch (IOException e) {
            return new AuthState();
        }
    }

    public void write(AuthState state) {
        try {
            Files.createDirectories(STATE_DIR);
            tightenPermissions(STATE_DIR, PosixFilePermissions.fromString("rwx------"));

            Files.writeString(STATE_FILE, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(state));
            tightenPermissions(STATE_FILE, PosixFilePermissions.fromString("rw-------"));
        } catch (IOException e) {
            throw new RuntimeException("Failed to persist CLI state: " + e.getMessage(), e);
        }
    }

    private void tightenPermissions(Path path, Set<PosixFilePermission> permissions) {
        try {
            Files.setPosixFilePermissions(path, permissions);
        } catch (UnsupportedOperationException ignored) {
            // Non-POSIX filesystem, skip.
        } catch (IOException ignored) {
            // Best effort only.
        }
    }
}
