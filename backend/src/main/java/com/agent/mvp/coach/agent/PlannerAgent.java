package com.agent.mvp.coach.agent;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class PlannerAgent {

    private final ModelGateway modelGateway;

    public PlannerAgent(ModelGateway modelGateway) {
        this.modelGateway = modelGateway;
    }

    public String plan(String requirement) {
        ModelChatRequest request = new ModelChatRequest(
                "gpt-4o", // default model
                List.of(
                        ModelChatMessage.of("system", "You are an expert Planner Agent. Break down the user's requirements into a structured development plan with clear steps."),
                        ModelChatMessage.of("user", requirement)
                ),
                null, null, null, null
        );

        ModelChatResponse response = modelGateway.chat(ModelProviderType.OPENAI, request);
        return response.content();
    }
}
