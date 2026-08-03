package com.agent.mvp.config;

import com.agent.mvp.coach.SentinelServicePrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class SentinelRequestFilter extends OncePerRequestFilter {
    private static final String REPORT_PATH = "/api/v1/sentinel/report";
    private final String receiverToken;
    private final int maxBytes;
    private final UUID ownerUserId;
    private final String source;

    @Autowired
    public SentinelRequestFilter(
            @Value("${BUG_SENTINEL_TOKEN:}") String receiverToken,
            @Value("${bug.sentinel.max-request-bytes:16384}") int maxBytes,
            @Value("${BUG_SENTINEL_OWNER_USER_ID:}") String ownerUserId,
            @Value("${BUG_SENTINEL_SOURCE:sentinel}") String source,
            @Value("${bug.sentinel.enabled:false}") boolean enabled) {
        this.receiverToken = receiverToken == null ? "" : receiverToken;
        this.maxBytes = Math.max(1024, maxBytes);
        this.ownerUserId = parseOwner(ownerUserId);
        this.source = new SentinelServicePrincipal(null, source).source();
        if (enabled && this.receiverToken.isBlank()) {
            throw new IllegalStateException("BUG_SENTINEL_TOKEN is required when Sentinel is enabled");
        }
        if (enabled && this.ownerUserId == null) {
            throw new IllegalStateException("BUG_SENTINEL_OWNER_USER_ID is required when Sentinel is enabled");
        }
    }

    public SentinelRequestFilter(String receiverToken, int maxBytes, String ownerUserId, String source) {
        this(receiverToken, maxBytes, ownerUserId, source, false);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !REPORT_PATH.equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!isValidAuthorization(request.getHeader(HttpHeaders.AUTHORIZATION))) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        if (request.getContentLengthLong() > maxBytes) {
            response.sendError(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            return;
        }
        byte[] body = request.getInputStream().readNBytes(maxBytes + 1);
        if (body.length > maxBytes) {
            response.sendError(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            return;
        }
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        new SentinelServicePrincipal(ownerUserId, source), null, List.of()));
        request.setAttribute("sentinel.source", source);
        chain.doFilter(new CachedBodyRequest(request, body), response);
    }

    private boolean isValidAuthorization(String authorization) {
        if (receiverToken.isBlank() || authorization == null || !authorization.startsWith("Sentinel ")) {
            return false;
        }
        return MessageDigest.isEqual(
                sha256(receiverToken), sha256(authorization.substring("Sentinel ".length())));
    }

    private byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    private UUID parseOwner(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("BUG_SENTINEL_OWNER_USER_ID must be a UUID", ex);
        }
    }

    private static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        private CachedBodyRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = Arrays.copyOf(body, body.length);
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public int read(byte[] b, int off, int len) { return input.read(b, off, len); }
                @Override public boolean isFinished() { return input.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(jakarta.servlet.ReadListener listener) { }
            };
        }

        @Override public int getContentLength() { return body.length; }
        @Override public long getContentLengthLong() { return body.length; }
    }
}
