package com.agent.mvp.common.exception;

public class ForbiddenException extends ApiException {

    public ForbiddenException(String message) {
        super("FORBIDDEN", message);
    }
}
