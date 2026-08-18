package com.agent.mvp.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import jakarta.servlet.FilterChain;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class SentinelRequestFilterTest {
    private static final String OWNER = "11111111-1111-1111-1111-111111111111";

    @Test
    void acceptsCorrectTokenAndRejectsWrongToken() throws Exception {
        SentinelRequestFilter filter =
                new SentinelRequestFilter("secret", 16384, OWNER, "sentinel");
        MockHttpServletRequest request = request("Sentinel secret", "{}");
        FilterChain chain = mock(FilterChain.class);
        filter.doFilter(request, new MockHttpServletResponse(), chain);
        verify(chain)
                .doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request("Sentinel wrong", "{}"), response, mock(FilterChain.class));
        assertEquals(401, response.getStatus());
    }

    @Test
    void rejectsUnconfiguredTokenAndUnknownLengthOversizedBody() throws Exception {
        SentinelRequestFilter missing = new SentinelRequestFilter("", 16384, OWNER, "sentinel");
        MockHttpServletResponse unauthorized = new MockHttpServletResponse();
        missing.doFilter(request(null, "{}"), unauthorized, mock(FilterChain.class));
        assertEquals(401, unauthorized.getStatus());

        SentinelRequestFilter filter = new SentinelRequestFilter("secret", 1024, OWNER, "sentinel");
        MockHttpServletRequest oversized = request("Sentinel secret", "x".repeat(1025));
        oversized.removeHeader("Content-Length");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        filter.doFilter(oversized, response, chain);
        assertEquals(413, response.getStatus());
        verify(chain, never())
                .doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void enabledConfigurationFailsFastWithoutTokenOrOwner() {
        assertThrows(
                IllegalStateException.class,
                () -> new SentinelRequestFilter("", 16384, OWNER, "sentinel", true));
        assertThrows(
                IllegalStateException.class,
                () -> new SentinelRequestFilter("secret", 16384, "", "sentinel", true));
    }

    private MockHttpServletRequest request(String authorization, String body) {
        MockHttpServletRequest request =
                new MockHttpServletRequest("POST", "/api/v1/sentinel/report");
        if (authorization != null) request.addHeader("Authorization", authorization);
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        return request;
    }
}
