package com.agent.mvp.auth.security;

import java.util.UUID;

public record AuthenticatedUser(UUID userId, String email) {}
