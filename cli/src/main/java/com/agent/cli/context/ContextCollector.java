package com.agent.cli.context;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.TimeUnit;

public class ContextCollector {

    public static String collectContext() {
        StringBuilder ctx = new StringBuilder();
        ctx.append("Current time: ").append(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)).append("\n\n");
        
        ctx.append(collectGitStatus());
        ctx.append(collectMemoryFiles());
        
        return ctx.toString();
    }

    private static String collectGitStatus() {
        if (!new File(".git").exists()) {
            return "";
        }
        StringBuilder git = new StringBuilder();
        try {
            git.append("Git Status:\n");
            git.append(execCmd("git", "--no-optional-locks", "status", "--short"));
            git.append("\nRecent Commits:\n");
            git.append(execCmd("git", "--no-optional-locks", "log", "--oneline", "-n", "5"));
            git.append("\n\n");
            return git.toString();
        } catch (Exception e) {
            return ""; // Best effort
        }
    }

    private static String collectMemoryFiles() {
        StringBuilder mem = new StringBuilder();
        String[] filesToCheck = {"CLAUDE.md", ".cursorrules", ".agentrules", "README.md"};
        for (String file : filesToCheck) {
            Path path = Paths.get(file);
            if (Files.exists(path) && Files.isRegularFile(path)) {
                try {
                    String content = Files.readString(path);
                    // limit to 2000 chars to avoid blowing up context
                    if (content.length() > 2000) {
                        content = content.substring(0, 2000) + "... (truncated)";
                    }
                    mem.append("File context (").append(file).append("):\n");
                    mem.append(content).append("\n\n");
                } catch (Exception e) {
                    // ignore
                }
            }
        }
        return mem.toString();
    }

    private static String execCmd(String... command) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.redirectErrorStream(true);
        Process p = pb.start();
        p.waitFor(2, TimeUnit.SECONDS);
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            return sb.toString();
        }
    }
}
