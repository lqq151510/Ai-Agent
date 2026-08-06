package com.agent.mvp.knowledge.review;

import java.time.Instant;

public record ReviewSchedule(Instant dueAt, int intervalDays, double easeFactor, int repetitions) {}
