package com.agent.mvp.coach.agent;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@Component
public class CoderAgent {

    private final ModelGateway modelGateway;
    private final String workspaceRoot;

    public CoderAgent(ModelGateway modelGateway, @Value("${WORKSPACE_ROOT:/app/workspace}") String workspaceRoot) {
        this.modelGateway = modelGateway;
        this.workspaceRoot = workspaceRoot;
    }

    public String code(String plan) {
        ModelChatRequest request = new ModelChatRequest(
                "gpt-4o",
                List.of(
                        ModelChatMessage.of("system", "You are an expert Coder Agent. Your job is to generate Java source code based on the provided plan. Please output the code. For MVP purposes, the generated code will be saved directly into the workspace root."),
                        ModelChatMessage.of("user", plan)
                ),
                null, null, null, null
        );

        ModelChatResponse response = modelGateway.chat(ModelProviderType.OPENAI, request);
        String codeOutput = response.content();
        
        try {
            Path root = Paths.get(workspaceRoot);
            if (!Files.exists(root)) {
                Files.createDirectories(root);
            }
            // For the MVP, we dump the entire output into a single file to satisfy the file-writing requirement.
            // A more sophisticated implementation would parse file paths from markdown blocks and write multiple files.
            Path generatedFile = root.resolve("GeneratedOutput.txt");
            Files.writeString(generatedFile, codeOutput);
        } catch (IOException e) {
            throw new RuntimeException("Failed to write code to workspace: " + workspaceRoot, e);
        }

        return codeOutput;
    }
}
