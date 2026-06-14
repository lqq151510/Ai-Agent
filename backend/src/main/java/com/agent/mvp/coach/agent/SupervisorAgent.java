package com.agent.mvp.coach.agent;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class SupervisorAgent {

    private static final Logger log = LoggerFactory.getLogger(SupervisorAgent.class);

    private final PlannerAgent plannerAgent;
    private final CoderAgent coderAgent;
    private final ReviewerAgent reviewerAgent;

    public SupervisorAgent(PlannerAgent plannerAgent, CoderAgent coderAgent, ReviewerAgent reviewerAgent) {
        this.plannerAgent = plannerAgent;
        this.coderAgent = coderAgent;
        this.reviewerAgent = reviewerAgent;
    }

    public String executeTask(String requirement) {
        log.info("Supervisor: Starting task execution. Requirement: {}", requirement);

        log.info("Supervisor: Calling PlannerAgent...");
        String plan = plannerAgent.plan(requirement);
        log.info("Supervisor: Plan generated.");

        log.info("Supervisor: Calling CoderAgent...");
        String code = coderAgent.code(plan);
        log.info("Supervisor: Code generated and written to workspace.");

        log.info("Supervisor: Calling ReviewerAgent...");
        String review = reviewerAgent.review(code);
        log.info("Supervisor: Review completed.");

        return "--- Plan ---\n" + plan + "\n\n--- Code ---\n" + code + "\n\n--- Review ---\n" + review;
    }
}
