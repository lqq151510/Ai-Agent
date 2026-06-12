package com.agent.mvp.common.context;

import java.util.UUID;
import org.slf4j.MDC;

public final class RequestContext {

    public static final String REQUEST_ID_KEY = "requestId";
    public static final String USER_ID_KEY = "userId";
    public static final String SESSION_ID_KEY = "sessionId";
    public static final String REQUEST_ID_HEADER = "X-Request-Id";

    private RequestContext() {}

    public static String ensureRequestId() {
        String current = MDC.get(REQUEST_ID_KEY);
        if (current != null && !current.isBlank()) {
            return current;
        }
        String generated = UUID.randomUUID().toString();
        MDC.put(REQUEST_ID_KEY, generated);
        return generated;
    }

    public static String getRequestId() {
        return MDC.get(REQUEST_ID_KEY);
    }
}
