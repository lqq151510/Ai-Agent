package com.agent.mvp.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.agent.mvp.common.dto.ErrorResponse;
import com.agent.mvp.common.exception.TooManyRequestsException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.resource.NoResourceFoundException;

class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void shouldMapMissingResourceToNotFound() {
        ResponseEntity<ErrorResponse> response =
                handler.handleNotFound(
                        new NoResourceFoundException(HttpMethod.GET, "/api/not-found"));

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("NOT_FOUND", response.getBody().code());
    }

    @Test
    void shouldMapRateLimitToTooManyRequests() {
        ResponseEntity<ErrorResponse> response =
                handler.handleApiException(new TooManyRequestsException("Too many requests"));

        assertEquals(HttpStatus.TOO_MANY_REQUESTS, response.getStatusCode());
        assertEquals("60", response.getHeaders().getFirst("Retry-After"));
        assertNotNull(response.getBody());
        assertEquals("TOO_MANY_REQUESTS", response.getBody().code());
    }
}
