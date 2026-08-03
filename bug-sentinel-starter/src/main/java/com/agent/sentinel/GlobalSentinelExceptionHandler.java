package com.agent.sentinel;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;

import java.io.PrintWriter;
import java.io.StringWriter;

public class GlobalSentinelExceptionHandler implements HandlerExceptionResolver {

    private final SentinelWebhookClient webhookClient;

    public GlobalSentinelExceptionHandler(SentinelWebhookClient webhookClient) {
        this.webhookClient = webhookClient;
    }

    @Override
    public ModelAndView resolveException(
            HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        if ("/api/v1/sentinel/report".equals(request.getRequestURI())) return null;
        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);
        ex.printStackTrace(pw);
        String stackTrace = SentinelRedactor.redact(sw.toString(), 4000);

        webhookClient.reportException(stackTrace);

        // Observe only. Existing application exception handlers retain response ownership.
        return null;
    }

}
