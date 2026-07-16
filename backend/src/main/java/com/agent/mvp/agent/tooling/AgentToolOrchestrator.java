package com.agent.mvp.agent.tooling;

import com.agent.mvp.tooling.service.CodeToolService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class AgentToolOrchestrator {

    private final Optional<CodeToolService> codeToolService;
    private final ObjectMapper objectMapper;

    public AgentToolOrchestrator(
            Optional<CodeToolService> codeToolService, ObjectMapper objectMapper) {
        this.codeToolService = codeToolService;
        this.objectMapper = objectMapper;
    }

    public List<ToolSpec> listToolSpecs() {
        if (codeToolService.isEmpty()) {
            return new java.util.ArrayList<>();
        }
        List<ToolSpec> specs =
                new java.util.ArrayList<>(
                        List.of(
                                new ToolSpec(
                                        "execute_cli_command",
                                        "Run a bash command on the user's local machine via the CLI"
                                                + " client. Use this to read files, run tests, list"
                                                + " dirs, or edit code locally.",
                                        schema(
                                                List.of("command"),
                                                "command",
                                                type("string"),
                                                "cwd",
                                                type("string"))),
                                new ToolSpec(
                                        "computer_use",
                                        "Control the user's macOS desktop through the approved"
                                            + " desktop client. Use only after the user asks for"
                                            + " computer/app control. Supported actions:"
                                            + " permissions, screenshot, click, type, keypress,"
                                            + " scroll.",
                                        schema(
                                                List.of("action"),
                                                "action",
                                                Map.of(
                                                        "type",
                                                        "string",
                                                        "enum",
                                                        List.of(
                                                                "permissions",
                                                                "screenshot",
                                                                "click",
                                                                "type",
                                                                "keypress",
                                                                "scroll")),
                                                "params",
                                                Map.of(
                                                        "type",
                                                        "object",
                                                        "additionalProperties",
                                                        true))),
                                new ToolSpec(
                                        "searchCode",
                                        "Search source code by regex-like pattern.",
                                        schema(
                                                List.of("query"),
                                                "query",
                                                type("string"),
                                                "glob",
                                                type("string"),
                                                "maxResults",
                                                integerType(1, 100))),
                                new ToolSpec(
                                        "readFile",
                                        "Read a file from workspace by path and optional line"
                                                + " range.",
                                        schema(
                                                List.of("path"),
                                                "path",
                                                type("string"),
                                                "startLine",
                                                integerType(1, null),
                                                "endLine",
                                                integerType(1, null))),
                                new ToolSpec(
                                        "listRepoTree",
                                        "List repository tree from a relative path with max depth.",
                                        schema(
                                                List.of(),
                                                "path",
                                                type("string"),
                                                "depth",
                                                integerType(1, 5))),
                                new ToolSpec(
                                        "analyzePom",
                                        "Summarize pom.xml dependencies and artifact info.",
                                        schema(List.of(), "path", type("string"))),
                                new ToolSpec(
                                        "runSkill",
                                        "Execute a skill by name. Skills are reusable instruction"
                                            + " bundles stored in .agents/skills/<name>/SKILL.md or"
                                            + " ~/.codex/skills/<name>/SKILL.md. Returns the skill"
                                            + " instructions which the model should follow.",
                                        schema(
                                                List.of("name"),
                                                "name",
                                                type("string"),
                                                "params",
                                                type("string")))));

        // Progressive Disclosure: Dynamic Skill Loading
        specs.addAll(scanDynamicSkills());
        return specs;
    }

    private List<ToolSpec> scanDynamicSkills() {
        List<ToolSpec> dynamicSpecs = new java.util.ArrayList<>();
        java.io.File skillsDir = new java.io.File(".agents/skills");
        if (!skillsDir.exists() || !skillsDir.isDirectory()) {
            // Also try fallback to .Codex/skills if available
            skillsDir = new java.io.File(".Codex/skills");
            if (!skillsDir.exists() || !skillsDir.isDirectory()) {
                return dynamicSpecs;
            }
        }

        java.io.File[] skillDirs = skillsDir.listFiles(java.io.File::isDirectory);
        if (skillDirs == null) return dynamicSpecs;

        for (java.io.File dir : skillDirs) {
            java.io.File skillMd = new java.io.File(dir, "SKILL.md");
            if (skillMd.exists()) {
                try {
                    String content = java.nio.file.Files.readString(skillMd.toPath());
                    String name = dir.getName();
                    String description = "Execute skill " + name;

                    // Basic YAML frontmatter parsing for name/description
                    if (content.startsWith("---")) {
                        int endIdx = content.indexOf("---", 3);
                        if (endIdx > 3) {
                            String frontmatter = content.substring(3, endIdx);
                            for (String line : frontmatter.split("\n")) {
                                if (line.startsWith("name:")) {
                                    name = line.substring(5).trim().replaceAll("^[\"']|[\"']$", "");
                                } else if (line.startsWith("description:")) {
                                    description =
                                            line.substring(12)
                                                    .trim()
                                                    .replaceAll("^[\"']|[\"']$", "");
                                }
                            }
                        }
                    }

                    // Provide a tool schema for the skill. Progressive Disclosure only needs
                    // optional params
                    // But we allow passing an 'instruction' argument if the LLM wants to pass
                    // context to the skill
                    dynamicSpecs.add(
                            new ToolSpec(
                                    name,
                                    description,
                                    schema(List.of(), "instruction", type("string"))));
                } catch (Exception ex) {
                    // Ignore parse errors for individual skills
                }
            }
        }
        return dynamicSpecs;
    }

    public java.util.concurrent.CompletableFuture<ToolResult> execute(
            ToolCall call,
            java.util.function.Function<ToolCall, java.util.concurrent.CompletableFuture<String>>
                    clientToolInvoker) {

        String name = call.name() == null ? "" : call.name();

        if (codeToolService.isEmpty()) {
            return java.util.concurrent.CompletableFuture.completedFuture(
                    new ToolResult(
                            call.id(),
                            name,
                            call.argumentsJson(),
                            "ERROR",
                            0,
                            "Tool not available in this profile"));
        }

        CodeToolService.ToolCallOutput output;
        JsonNode args = parseArgs(call.argumentsJson());

        if ("execute_cli_command".equals(name) || "computer_use".equals(name)) {
            long start = System.currentTimeMillis();
            try {
                return clientToolInvoker
                        .apply(call)
                        .handle(
                                (res, ex) -> {
                                    String status = "SUCCESS";
                                    if (ex != null) {
                                        res = "ERROR: " + ex.getMessage();
                                        status = "ERROR";
                                    } else if (res != null && res.startsWith("ERROR:")) {
                                        status = "ERROR";
                                    }
                                    return new ToolResult(
                                            call.id(),
                                            name,
                                            call.argumentsJson(),
                                            status,
                                            System.currentTimeMillis() - start,
                                            res);
                                });
            } catch (Exception ex) {
                return java.util.concurrent.CompletableFuture.completedFuture(
                        new ToolResult(
                                call.id(),
                                name,
                                call.argumentsJson(),
                                "ERROR",
                                System.currentTimeMillis() - start,
                                "ERROR: " + ex.getMessage()));
            }
        }

        output =
                switch (name) {
                    case "searchCode" ->
                            codeToolService
                                    .get()
                                    .searchCode(
                                            text(args, "query"),
                                            text(args, "glob"),
                                            integer(args, "maxResults", 40));
                    case "readFile" ->
                            codeToolService
                                    .get()
                                    .readFile(
                                            text(args, "path"),
                                            boxedInt(args, "startLine"),
                                            boxedInt(args, "endLine"));
                    case "listRepoTree" ->
                            codeToolService
                                    .get()
                                    .listRepoTree(
                                            fallback(text(args, "path"), "."),
                                            integer(args, "depth", 3));
                    case "analyzePom" ->
                            codeToolService
                                    .get()
                                    .analyzePom(fallback(text(args, "path"), "pom.xml"));
                    case "runSkill" ->
                            executeDynamicSkill(
                                    text(args, "name"), text(args, "params"), argsJson(args));
                    default -> executeDynamicSkill(name, argsJson(args));
                };

        return java.util.concurrent.CompletableFuture.completedFuture(
                new ToolResult(
                        call.id(),
                        output.toolName(),
                        output.argsJson(),
                        output.status(),
                        output.durationMs(),
                        output.output()));
    }

    private JsonNode parseArgs(String argumentsJson) {
        if (argumentsJson == null || argumentsJson.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(argumentsJson);
        } catch (Exception ex) {
            return objectMapper.createObjectNode();
        }
    }

    private String argsJson(JsonNode args) {
        return args == null ? "{}" : args.toString();
    }

    private java.io.File resolveSkillDir(String name) {
        // Try multiple locations in priority order
        String[] basePaths = {
            ".agents/skills", ".Codex/skills", System.getProperty("user.home") + "/.codex/skills",
        };
        for (String basePath : basePaths) {
            java.io.File dir = new java.io.File(basePath, name);
            if (dir.isDirectory() && new java.io.File(dir, "SKILL.md").exists()) {
                return dir;
            }
        }
        return null;
    }

    private CodeToolService.ToolCallOutput executeDynamicSkill(String name, String argsJson) {
        return executeDynamicSkill(name, null, argsJson);
    }

    private CodeToolService.ToolCallOutput executeDynamicSkill(
            String name, String params, String argsJson) {
        long start = System.currentTimeMillis();
        java.io.File skillDir = resolveSkillDir(name);

        if (skillDir != null) {
            try {
                java.io.File skillMd = new java.io.File(skillDir, "SKILL.md");
                String content = java.nio.file.Files.readString(skillMd.toPath());
                StringBuilder result = new StringBuilder();
                result.append("SKILL.md loaded successfully.\n\n");
                result.append(content).append("\n\n");

                // Include params if provided
                if (params != null && !params.isBlank()) {
                    result.append("---\nSkill parameters: ").append(params).append("\n");
                }

                // Check for scripts directory
                java.io.File scriptsDir = new java.io.File(skillDir, "scripts");
                if (scriptsDir.isDirectory()) {
                    result.append("Available scripts:\n");
                    java.io.File[] scripts = scriptsDir.listFiles();
                    if (scripts != null) {
                        for (java.io.File script : scripts) {
                            result.append("  - ").append(script.getName()).append("\n");
                        }
                    }
                }

                return new CodeToolService.ToolCallOutput(
                        name,
                        argsJson,
                        "SUCCESS",
                        System.currentTimeMillis() - start,
                        result.toString());
            } catch (Exception ex) {
                return new CodeToolService.ToolCallOutput(
                        name,
                        argsJson,
                        "ERROR",
                        System.currentTimeMillis() - start,
                        "Failed to read SKILL.md: " + ex.getMessage());
            }
        }

        return new CodeToolService.ToolCallOutput(
                name,
                argsJson,
                "ERROR",
                System.currentTimeMillis() - start,
                "Unknown tool or skill not found: "
                        + name
                        + ". Available skills can be discovered via the 'runSkill' tool.");
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        String out = value.asText();
        return out == null || out.isBlank() ? null : out;
    }

    private Integer boxedInt(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        return value.asInt();
    }

    private int integer(JsonNode node, String field, int fallback) {
        Integer value = boxedInt(node, field);
        return value == null ? fallback : value;
    }

    private String fallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private Map<String, Object> type(String type) {
        return Map.of("type", type);
    }

    private Map<String, Object> integerType(Integer minimum, Integer maximum) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("type", "integer");
        if (minimum != null) {
            out.put("minimum", minimum);
        }
        if (maximum != null) {
            out.put("maximum", maximum);
        }
        return out;
    }

    private Map<String, Object> schema(List<String> required, Object... pairs) {
        Map<String, Object> props = new java.util.LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            props.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        Map<String, Object> schema = new java.util.LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", props);
        schema.put("additionalProperties", false);
        if (required != null && !required.isEmpty()) {
            schema.put("required", required);
        }
        return schema;
    }
}
