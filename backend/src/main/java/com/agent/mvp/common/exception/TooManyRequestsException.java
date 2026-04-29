package com.agent.mvp.common.exception;

public class TooManyRequestsException extends ApiException {

    public TooManyRequestsException(String message) {
        super("TOO_MANY_REQUESTS", message);
    }
}
