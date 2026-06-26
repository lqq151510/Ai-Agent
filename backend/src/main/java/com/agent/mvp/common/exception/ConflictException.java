package com.agent.mvp.common.exception;

public class ConflictException extends ApiException {

    public ConflictException(String message) {
        super("CONFLICT", message);
    }
}
