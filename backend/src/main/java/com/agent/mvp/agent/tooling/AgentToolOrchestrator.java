package com.agent.mvp.agent.tooling;

import com.agent.mvp.tooling.dto.ToolExecutionResult;
import com.agent.mvp.tooling.service.CodeToolService;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class AgentToolOrchestrator {

    private final CodeToolService codeToolService;

    public AgentToolOrchestrator(CodeToolService codeToolService) {
        this.codeToolService = codeToolService;
    }

    public ToolRunBundle runToolsForMessage(String userMessage) {
        List<ToolExecutionResult> traces = new ArrayList<>();
        String message = userMessage == null ? "" : userMessage.toLowerCase();

        if (message.contains("目录") || message.contains("结构") || message.contains("tree") || message.contains("module")) {
            var output = codeToolService.listRepoTree(".", 3);
            traces.add(toTrace(output));
        }

        if (message.contains("pom") || message.contains("依赖") || message.contains("maven")) {
            var output = codeToolService.analyzePom("pom.xml");
            traces.add(toTrace(output));
        }

        // Default to searchCode so the agent can ground in repo context.
        var search = codeToolService.searchCode(userMessage, null, 40);
        traces.add(toTrace(search));

        StringBuilder context = new StringBuilder();
        for (ToolExecutionResult trace : traces) {
            context.append("\n[tool:")
                    .append(trace.toolName())
                    .append("]\n")
                    .append(trace.output())
                    .append("\n");
        }

        return new ToolRunBundle(context.toString(), traces);
    }

    private ToolExecutionResult toTrace(CodeToolService.ToolCallOutput output) {
        return new ToolExecutionResult(
                output.toolName(),
                output.argsJson(),
                output.status(),
                output.durationMs(),
                output.output()
        );
    }
}
