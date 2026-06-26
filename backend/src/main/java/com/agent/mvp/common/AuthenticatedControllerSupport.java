package com.agent.mvp.common;

import com.agent.mvp.auth.security.AuthenticatedUser;
import com.agent.mvp.common.exception.UnauthorizedException;
import org.springframework.security.core.Authentication;

public abstract class AuthenticatedControllerSupport {

    protected AuthenticatedUser requireAuthenticatedUser(Authentication authentication) {
        if (authentication == null
                || !(authentication.getPrincipal() instanceof AuthenticatedUser principal)) {
            throw new UnauthorizedException("Authentication required");
        }
        return principal;
    }
}
