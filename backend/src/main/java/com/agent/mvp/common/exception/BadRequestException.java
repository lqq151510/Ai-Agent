package com.agent.mvp.common.exception;

public class BadRequestException extends ApiException {

    public BadRequestException(String message) {
        super("BAD_REQUEST", message);
    }
}
