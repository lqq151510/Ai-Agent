package com.agent.mvp.common.exception;

public class UnauthorizedException extends ApiException {

    public UnauthorizedException(String message) {
        super("UNAUTHORIZED", message);
    }
}
