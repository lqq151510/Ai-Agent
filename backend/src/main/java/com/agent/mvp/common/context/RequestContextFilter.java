package com.agent.mvp.common.context;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component("agentRequestContextFilter")
public class RequestContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String incoming = request.getHeader(RequestContext.REQUEST_ID_HEADER);
        String requestId = (incoming == null || incoming.isBlank()) ? UUID.randomUUID().toString() : incoming.trim();

        response.setHeader(RequestContext.REQUEST_ID_HEADER, requestId);
        MDC.put(RequestContext.REQUEST_ID_KEY, requestId);
        request.setAttribute(RequestContext.REQUEST_ID_KEY, requestId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove(RequestContext.REQUEST_ID_KEY);
            MDC.remove(RequestContext.USER_ID_KEY);
            MDC.remove(RequestContext.SESSION_ID_KEY);
        }
    }
}
