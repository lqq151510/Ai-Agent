package com.agent.mvp.agent.tooling;

import com.agent.mvp.tooling.service.CodeToolService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class AgentToolOrchestrator {

    private final CodeToolService codeToolService;
    private final ObjectMapper objectMapper;

    public AgentToolOrchestrator(CodeToolService codeToolService, ObjectMapper objectMapper) {
        this.codeToolService = codeToolService;
        this.objectMapper = objectMapper;
    }

    public List<ToolSpec> listToolSpecs() {
        return List.of(
                new ToolSpec(
                        "execute_cli_command",
                        "Run a bash command on the user's local machine via the CLI client. Use this to read files, run tests, list dirs, or edit code locally.",
                        schema(List.of("command"), "command", type("string"), "cwd", type("string"))
                ),
                new ToolSpec(
                        "searchCode",
                        "Search source code by regex-like pattern.",
                        schema(
                                List.of("query"),
                                "query", type("string"),
                                "glob", type("string"),
                                "maxResults", integerType(1, 100)
                        )
                ),
                new ToolSpec(
                        "readFile",
                        "Read a file from workspace by path and optional line range.",
                        schema(
                                List.of("path"),
                                "path", type("string"),
                                "startLine", integerType(1, null),
                                "endLine", integerType(1, null)
                        )
                ),
                new ToolSpec(
                        "listRepoTree",
                        "List repository tree from a relative path with max depth.",
                        schema(
                                List.of(),
                                "path", type("string"),
                                "depth", integerType(1, 5)
                        )
                ),
                new ToolSpec(
                        "analyzePom",
                        "Summarize pom.xml dependencies and artifact info.",
                        schema(List.of(), "path", type("string"))
                )
        );
    }

    public java.util.concurrent.CompletableFuture<ToolResult> execute(ToolCall call, java.util.function.Function<ToolCall, java.util.concurrent.CompletableFuture<String>> clientToolInvoker) {
        CodeToolService.ToolCallOutput output;
        JsonNode args = parseArgs(call.argumentsJson());
        String name = call.name() == null ? "" : call.name();

        if ("execute_cli_command".equals(name)) {
            long start = System.currentTimeMillis();
            try {
                return clientToolInvoker.apply(call).handle((res, ex) -> {
                    String status = "SUCCESS";
                    if (ex != null) {
                        res = "ERROR: " + ex.getMessage();
                        status = "ERROR";
                    } else if (res != null && res.startsWith("ERROR:")) {
                        status = "ERROR";
                    }
                    return new ToolResult(call.id(), name, call.argumentsJson(), status, System.currentTimeMillis() - start, res);
                });
            } catch (Exception ex) {
                return java.util.concurrent.CompletableFuture.completedFuture(
                        new ToolResult(call.id(), name, call.argumentsJson(), "ERROR", System.currentTimeMillis() - start, "ERROR: " + ex.getMessage())
                );
            }
        }

        output = switch (name) {
            case "searchCode" -> codeToolService.searchCode(
                    text(args, "query"),
                    text(args, "glob"),
                    integer(args, "maxResults", 40)
            );
            case "readFile" -> codeToolService.readFile(
                    text(args, "path"),
                    boxedInt(args, "startLine"),
                    boxedInt(args, "endLine")
            );
            case "listRepoTree" -> codeToolService.listRepoTree(
                    fallback(text(args, "path"), "."),
                    integer(args, "depth", 3)
            );
            case "analyzePom" -> codeToolService.analyzePom(fallback(text(args, "path"), "pom.xml"));
            default -> new CodeToolService.ToolCallOutput(name, call.argumentsJson(), "ERROR", 0, "Unknown tool: " + name);
        };

        return java.util.concurrent.CompletableFuture.completedFuture(new ToolResult(
                call.id(),
                output.toolName(),
                output.argsJson(),
                output.status(),
                output.durationMs(),
                output.output()
        ));
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
