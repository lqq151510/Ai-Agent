package com.agent.sentinel;

import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.io.PrintWriter;
import java.io.StringWriter;

@ControllerAdvice
public class GlobalSentinelExceptionHandler {

    private final SentinelWebhookClient webhookClient;

    public GlobalSentinelExceptionHandler(SentinelWebhookClient webhookClient) {
        this.webhookClient = webhookClient;
    }

    @ExceptionHandler(Exception.class)
    public void handleException(Exception ex) throws Exception {
        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);
        ex.printStackTrace(pw);
        String stackTrace = sw.toString();

        webhookClient.reportException(stackTrace);

        // Re-throw the exception so the normal spring boot error handling can take over
        throw ex;
    }
}
