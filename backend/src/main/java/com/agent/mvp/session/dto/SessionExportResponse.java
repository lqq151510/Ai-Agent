package com.agent.mvp.session.dto;

import java.time.Instant;
import java.util.List;

public record SessionExportResponse(
        SessionResponse session, List<MessageResponse> messages, Instant exportedAt) {}
