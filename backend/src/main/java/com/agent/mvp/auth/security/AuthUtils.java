package com.agent.mvp.auth.security;

import com.agent.mvp.common.exception.UnauthorizedException;
import org.springframework.security.core.Authentication;

public final class AuthUtils {
    
    private AuthUtils() {
    }

    public static AuthenticatedUser requireUser(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser principal)) {
            throw new UnauthorizedException("Authentication required");
        }
        return principal;
    }
}
