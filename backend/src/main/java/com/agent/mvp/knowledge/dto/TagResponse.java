package com.agent.mvp.knowledge.dto;

import java.time.Instant;
import java.util.UUID;

public record TagResponse(UUID id, String name, String color, Instant createdAt) {}
