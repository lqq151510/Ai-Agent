package com.agent.mvp.coach.agent;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

@org.springframework.context.annotation.Profile("legacy")
@Component
public class CoderAgent {

    private final ModelGateway modelGateway;
    private final SandboxManager sandboxManager;

    public CoderAgent(ModelGateway modelGateway, SandboxManager sandboxManager) {
        this.modelGateway = modelGateway;
        this.sandboxManager = sandboxManager;
    }

    /**
     * 兼容旧调用入口：不指定 runId 时自动生成一个临时 runId，仍写入沙箱目录而非工作区根目录。
     *
     * @deprecated 推荐使用 {@link #code(UUID, String)} 显式传入 runId，便于回滚与归档。
     */
    @Deprecated
    public String code(String plan) {
        return code(UUID.randomUUID(), plan);
    }

    /**
     * 根据计划生成代码，并将输出写入沙箱目录 {@code workspace/coach-runs/{runId}/GeneratedOutput.txt}。
     *
     * @param runId 沙箱运行 ID，用于隔离与回滚
     * @param plan 开发计划文本
     * @return 模型生成的代码内容
     */
    public String code(UUID runId, String plan) {
        ModelChatRequest request =
                new ModelChatRequest(
                        "gpt-4o",
                        List.of(
                                ModelChatMessage.of(
                                        "system",
                                        "You are an expert Coder Agent. Your job is to generate"
                                            + " Java source code based on the provided plan. Please"
                                            + " output the code. The generated code will be saved"
                                            + " into an isolated sandbox directory for safety and"
                                            + " rollback."),
                                ModelChatMessage.of("user", plan)),
                        null,
                        null,
                        null,
                        null);

        ModelChatResponse response = modelGateway.chat(ModelProviderType.OPENAI, request);
        String codeOutput = response.content();

        // 写入沙箱目录，避免直接覆盖工作区根目录下的用户文件
        sandboxManager.writeFile(runId, "GeneratedOutput.txt", codeOutput);

        return codeOutput;
    }
}
