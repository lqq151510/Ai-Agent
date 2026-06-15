package com.agent.mvp.coach.event;

import org.springframework.context.ApplicationEvent;

public class PlanProposedEvent extends ApplicationEvent {
    private final int round;
    private final String requirement;
    private final String plan;

    public PlanProposedEvent(Object source, int round, String requirement, String plan) {
        super(source);
        this.round = round;
        this.requirement = requirement;
        this.plan = plan;
    }

    public int getRound() {
        return round;
    }

    public String getRequirement() {
        return requirement;
    }

    public String getPlan() {
        return plan;
    }
}
