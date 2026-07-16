package com.agent.mvp.modelsource.dto;

import java.time.Instant;
import java.util.UUID;

public record ModelSourceTestResponse(UUID id, String status, String message, Instant checkedAt) {}
