package com.agent.mvp.tooling.service;

import com.agent.mvp.common.exception.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;

@Service
@Profile("legacy")
public class CodeToolService {

    private static final int MAX_READ_LINES = 400;

    private final Path workspaceRoot;
    private final Path workspaceRealRoot;
    private final ObjectMapper objectMapper;

    public CodeToolService(
            com.agent.mvp.config.AppProperties appProperties, ObjectMapper objectMapper) {
        this.workspaceRoot =
                Paths.get(appProperties.getWorkspaceRoot()).toAbsolutePath().normalize();
        this.workspaceRealRoot = resolveRealWorkspaceRoot(this.workspaceRoot);
        this.objectMapper = objectMapper;
    }

    public ToolCallOutput listRepoTree(String relativePath, int depth) {
        long start = System.currentTimeMillis();
        try {
            Path root =
                    resolveSafe(
                            relativePath == null || relativePath.isBlank() ? "." : relativePath);
            if (!Files.exists(root)) {
                throw new BadRequestException("Path not found: " + relativePath);
            }

            List<String> rows = new ArrayList<>();
            try (var stream = Files.walk(root, Math.max(1, Math.min(depth, 5)))) {
                stream.limit(500)
                        .forEach(
                                path ->
                                        rows.add(
                                                workspaceRealRoot
                                                        .relativize(
                                                                path.toAbsolutePath().normalize())
                                                        .toString()));
            }

            String output = String.join("\n", rows);
            return new ToolCallOutput(
                    "listRepoTree",
                    toJson(args("path", relativePath, "depth", depth)),
                    "SUCCESS",
                    System.currentTimeMillis() - start,
                    output);
        } catch (IOException ex) {
            return new ToolCallOutput(
                    "listRepoTree",
                    toJson(args("path", relativePath, "depth", depth)),
                    "ERROR",
                    System.currentTimeMillis() - start,
                    "listRepoTree failed: " + ex.getMessage());
        }
    }

    public ToolCallOutput searchCode(String query, String glob, int maxResults) {
        long start = System.currentTimeMillis();
        String safeQuery = query == null ? "" : query.trim();
        if (safeQuery.isBlank()) {
            return new ToolCallOutput(
                    "searchCode", toJson(args("query", query)), "ERROR", 0, "Query is empty");
        }

        List<String> command =
                new ArrayList<>(
                        List.of(
                                "rg",
                                "-n",
                                "--no-heading",
                                "--hidden",
                                "--max-count",
                                String.valueOf(Math.max(1, Math.min(maxResults, 100))),
                                "--regexp",
                                safeQuery,
                                "--",
                                workspaceRoot.toString()));
        if (glob != null && !glob.isBlank()) {
            command.add("-g");
            command.add(glob);
        }

        ProcessBuilder pb = new ProcessBuilder(command);
        pb.redirectErrorStream(true);

        try {
            Process process = pb.start();
            boolean finished = process.waitFor(8, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return new ToolCallOutput(
                        "searchCode",
                        toJson(args("query", query, "glob", glob)),
                        "ERROR",
                        System.currentTimeMillis() - start,
                        "searchCode timeout");
            }

            String output;
            try (BufferedReader reader =
                    new BufferedReader(
                            new InputStreamReader(
                                    process.getInputStream(), StandardCharsets.UTF_8))) {
                output =
                        reader.lines()
                                .limit(200)
                                .collect(java.util.stream.Collectors.joining("\n"));
            }

            if (output.isBlank()) {
                output = "No matches found.";
            }

            return new ToolCallOutput(
                    "searchCode",
                    toJson(args("query", query, "glob", glob, "maxResults", maxResults)),
                    process.exitValue() <= 1 ? "SUCCESS" : "ERROR",
                    System.currentTimeMillis() - start,
                    output);
        } catch (Exception ex) {
            return new ToolCallOutput(
                    "searchCode",
                    toJson(args("query", query, "glob", glob, "maxResults", maxResults)),
                    "ERROR",
                    System.currentTimeMillis() - start,
                    "searchCode failed: " + ex.getMessage());
        }
    }

    public ToolCallOutput readFile(String relativePath, Integer startLine, Integer endLine) {
        long start = System.currentTimeMillis();
        try {
            Path file = resolveSafe(relativePath);

            int from = startLine == null ? 1 : Math.max(1, startLine);
            int to = endLine == null ? from + MAX_READ_LINES - 1 : endLine;
            if (to < from) {
                throw new BadRequestException("Invalid line range");
            }
            if (to - from + 1 > MAX_READ_LINES) {
                to = from + MAX_READ_LINES - 1;
            }

            StringBuilder sb = new StringBuilder();
            try (java.util.stream.Stream<String> lineStream =
                    Files.lines(file, StandardCharsets.UTF_8)) {
                java.util.Iterator<String> iterator =
                        lineStream.skip(from - 1).limit(to - from + 1).iterator();
                int currentLine = from;
                while (iterator.hasNext()) {
                    sb.append(currentLine++).append(": ").append(iterator.next()).append('\n');
                }
            }

            return new ToolCallOutput(
                    "readFile",
                    toJson(args("path", relativePath, "startLine", from, "endLine", to)),
                    "SUCCESS",
                    System.currentTimeMillis() - start,
                    sb.toString().trim());
        } catch (IOException ex) {
            return new ToolCallOutput(
                    "readFile",
                    toJson(args("path", relativePath, "startLine", startLine, "endLine", endLine)),
                    "ERROR",
                    System.currentTimeMillis() - start,
                    "readFile failed: " + ex.getMessage());
        }
    }

    public ToolCallOutput analyzePom(String relativePath) {
        long start = System.currentTimeMillis();
        String filePath =
                (relativePath == null || relativePath.isBlank()) ? "pom.xml" : relativePath;

        try {
            Path pom = resolveSafe(filePath);
            javax.xml.parsers.DocumentBuilderFactory factory =
                    javax.xml.parsers.DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            javax.xml.parsers.DocumentBuilder builder = factory.newDocumentBuilder();
            org.w3c.dom.Document doc = builder.parse(pom.toFile());

            org.w3c.dom.NodeList artifactNodes = doc.getElementsByTagName("artifactId");
            String projectArtifact =
                    artifactNodes.getLength() > 0
                            ? artifactNodes.item(0).getTextContent()
                            : "unknown";

            List<String> dependencies = new ArrayList<>();
            org.w3c.dom.NodeList deps = doc.getElementsByTagName("dependency");
            for (int i = 0; i < deps.getLength() && dependencies.size() < 80; i++) {
                org.w3c.dom.Element dep = (org.w3c.dom.Element) deps.item(i);
                String group = getTagValue("groupId", dep);
                String artifact = getTagValue("artifactId", dep);
                String version = getTagValue("version", dep);
                dependencies.add(group + ":" + artifact + ":" + version);
            }

            String output =
                    "artifact="
                            + projectArtifact
                            + "\n"
                            + "dependencies="
                            + dependencies.size()
                            + "\n"
                            + String.join("\n", dependencies);
            return new ToolCallOutput(
                    "analyzePom",
                    toJson(args("path", filePath)),
                    "SUCCESS",
                    System.currentTimeMillis() - start,
                    output);
        } catch (Exception ex) {
            return new ToolCallOutput(
                    "analyzePom",
                    toJson(args("path", filePath)),
                    "ERROR",
                    System.currentTimeMillis() - start,
                    "analyzePom failed: " + ex.getMessage());
        }
    }

    private String getTagValue(String tag, org.w3c.dom.Element element) {
        org.w3c.dom.NodeList nodeList = element.getElementsByTagName(tag);
        if (nodeList != null && nodeList.getLength() > 0) {
            return nodeList.item(0).getTextContent();
        }
        return "";
    }

    private Path resolveSafe(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            throw new BadRequestException("Path is required");
        }

        Path candidate = workspaceRoot.resolve(relativePath).normalize().toAbsolutePath();
        if (!candidate.startsWith(workspaceRoot)) {
            throw new BadRequestException("Path escapes workspace root");
        }

        if (Files.exists(candidate)) {
            try {
                Path realCandidate = candidate.toRealPath();
                if (!realCandidate.startsWith(workspaceRealRoot)) {
                    throw new BadRequestException("Path escapes workspace root");
                }
                return realCandidate;
            } catch (IOException ex) {
                throw new BadRequestException("Path cannot be resolved: " + relativePath);
            }
        }
        return candidate;
    }

    private Path resolveRealWorkspaceRoot(Path root) {
        try {
            return root.toRealPath();
        } catch (IOException ex) {
            throw new IllegalStateException("Workspace root does not exist: " + root, ex);
        }
    }

    private Map<String, Object> args(Object... pairs) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            map.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return map;
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }

    public record ToolCallOutput(
            String toolName, String argsJson, String status, long durationMs, String output) {}
}
