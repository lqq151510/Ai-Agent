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

    public ToolResult execute(ToolCall call) {
        CodeToolService.ToolCallOutput output;
        JsonNode args = parseArgs(call.argumentsJson());
        String name = call.name() == null ? "" : call.name();
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

        return new ToolResult(
                call.id(),
                output.toolName(),
                output.argsJson(),
                output.status(),
                output.durationMs(),
                output.output()
        );
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
