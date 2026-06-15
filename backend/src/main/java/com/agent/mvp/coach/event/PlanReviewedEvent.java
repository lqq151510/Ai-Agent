package com.agent.mvp.coach.event;

import org.springframework.context.ApplicationEvent;

public class PlanReviewedEvent extends ApplicationEvent {
    private final int round;
    private final boolean approved;
    private final String feedback;

    public PlanReviewedEvent(Object source, int round, boolean approved, String feedback) {
        super(source);
        this.round = round;
        this.approved = approved;
        this.feedback = feedback;
    }

    public int getRound() {
        return round;
    }

    public boolean isApproved() {
        return approved;
    }

    public String getFeedback() {
        return feedback;
    }
}
