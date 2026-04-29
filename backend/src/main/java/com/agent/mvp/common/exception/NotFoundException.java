package com.agent.mvp.common.exception;

public class NotFoundException extends ApiException {

    public NotFoundException(String message) {
        super("NOT_FOUND", message);
    }
}
