package com.agent.mvp.common.exception;

public class BadGatewayException extends ApiException {

    public BadGatewayException(String message) {
        super("BAD_GATEWAY", message);
    }
}
