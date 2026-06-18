package com.agent.mvp.agent.tooling;

import com.agent.mvp.tooling.service.CodeToolService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class AgentToolOrchestrator {

    private final CodeToolService codeToolService;
    private final ObjectMapper objectMapper;

    public AgentToolOrchestrator(CodeToolService codeToolService, ObjectMapper objectMapper) {
        this.codeToolService = codeToolService;
        this.objectMapper = objectMapper;
    }

    public List<ToolSpec> listToolSpecs() {
        List<ToolSpec> specs = new java.util.ArrayList<>(List.of(
                new ToolSpec(
                        "execute_cli_command",
                        "Run a bash command on the user's local machine via the CLI client. Use"
                            + " this to read files, run tests, list dirs, or edit code locally.",
                        schema(
                                List.of("command"),
                                "command",
                                type("string"),
                                "cwd",
                                type("string"))),
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
                        "Read a file from workspace by path and optional line range.",
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
                        schema(List.of(), "path", type("string"), "depth", integerType(1, 5))),
                new ToolSpec(
                        "analyzePom",
                        "Summarize pom.xml dependencies and artifact info.",
                        schema(List.of(), "path", type("string")))));
        
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
                                    description = line.substring(12).trim().replaceAll("^[\"']|[\"']$", "");
                                }
                            }
                        }
                    }
                    
                    // Provide a tool schema for the skill. Progressive Disclosure only needs optional params
                    // But we allow passing an 'instruction' argument if the LLM wants to pass context to the skill
                    dynamicSpecs.add(new ToolSpec(
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
        CodeToolService.ToolCallOutput output;
        JsonNode args = parseArgs(call.argumentsJson());
        String name = call.name() == null ? "" : call.name();

        if ("execute_cli_command".equals(name)) {
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
                            codeToolService.searchCode(
                                    text(args, "query"),
                                    text(args, "glob"),
                                    integer(args, "maxResults", 40));
                    case "readFile" ->
                            codeToolService.readFile(
                                    text(args, "path"),
                                    boxedInt(args, "startLine"),
                                    boxedInt(args, "endLine"));
                    case "listRepoTree" ->
                            codeToolService.listRepoTree(
                                    fallback(text(args, "path"), "."), integer(args, "depth", 3));
                    case "analyzePom" ->
                            codeToolService.analyzePom(fallback(text(args, "path"), "pom.xml"));
                    default ->
                            executeDynamicSkill(name, argsJson(args));
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

    private CodeToolService.ToolCallOutput executeDynamicSkill(String name, String argsJson) {
        long start = System.currentTimeMillis();
        java.io.File skillsDir = new java.io.File(".agents/skills");
        if (!skillsDir.exists() || !skillsDir.isDirectory()) {
            skillsDir = new java.io.File(".Codex/skills");
        }
        java.io.File skillDir = new java.io.File(skillsDir, name);
        java.io.File skillMd = new java.io.File(skillDir, "SKILL.md");

        if (skillMd.exists()) {
            try {
                String content = java.nio.file.Files.readString(skillMd.toPath());
                return new CodeToolService.ToolCallOutput(
                        name,
                        argsJson,
                        "SUCCESS",
                        System.currentTimeMillis() - start,
                        "PROGRESSIVE DISCLOSURE (Read SKILL.md successfully):\n\n" + content);
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
                "Unknown tool or skill not found: " + name);
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
