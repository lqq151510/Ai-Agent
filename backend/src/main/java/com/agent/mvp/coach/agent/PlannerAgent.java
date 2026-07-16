package com.agent.mvp.coach.agent;

import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.agent.dto.ModelChatMessage;
import com.agent.mvp.agent.dto.ModelChatRequest;
import com.agent.mvp.agent.dto.ModelChatResponse;
import com.agent.mvp.agent.service.ModelGateway;
import java.util.List;
import org.springframework.stereotype.Component;

@org.springframework.context.annotation.Profile("legacy")
@Component
public class PlannerAgent {

    private final ModelGateway modelGateway;

    public PlannerAgent(ModelGateway modelGateway) {
        this.modelGateway = modelGateway;
    }

    public String plan(String requirement) {
        ModelChatRequest request =
                new ModelChatRequest(
                        "gpt-4o", // default model
                        List.of(
                                ModelChatMessage.of(
                                        "system",
                                        "You are an expert Planner Agent. Break down the user's"
                                                + " requirements into a structured development plan"
                                                + " with clear steps."),
                                ModelChatMessage.of("user", requirement)),
                        null,
                        null,
                        null,
                        null);

        ModelChatResponse response = modelGateway.chat(ModelProviderType.OPENAI, request);
        return response.content();
    }

    public String replan(String requirement, String previousPlan, String feedback) {
        ModelChatRequest request =
                new ModelChatRequest(
                        "gpt-4o",
                        List.of(
                                ModelChatMessage.of(
                                        "system",
                                        "You are an expert Planner Agent. Optimize and refine the"
                                                + " previous development plan based on the provided"
                                                + " user requirements and peer feedback. Ensure all"
                                                + " criticisms are addressed."),
                                ModelChatMessage.of(
                                        "user",
                                        String.format(
                                                "Original Requirement: %s\n\n"
                                                        + "Previous Plan:\n"
                                                        + "%s\n\n"
                                                        + "Feedback/Critique:\n"
                                                        + "%s\n\n"
                                                        + "Please output the revised structured"
                                                        + " development plan.",
                                                requirement, previousPlan, feedback))),
                        null,
                        null,
                        null,
                        null);

        ModelChatResponse response = modelGateway.chat(ModelProviderType.OPENAI, request);
        return response.content();
    }
}
