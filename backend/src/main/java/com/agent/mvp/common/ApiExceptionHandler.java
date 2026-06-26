package com.agent.mvp.common;

import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.common.dto.ErrorResponse;
import com.agent.mvp.common.exception.ApiException;
import jakarta.validation.ConstraintViolationException;
import java.time.Instant;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException ex) {
        HttpStatus status =
                switch (ex.getCode()) {
                    case "UNAUTHORIZED" -> HttpStatus.UNAUTHORIZED;
                    case "FORBIDDEN" -> HttpStatus.FORBIDDEN;
                    case "NOT_FOUND" -> HttpStatus.NOT_FOUND;
                    case "BAD_REQUEST" -> HttpStatus.BAD_REQUEST;
                    case "CONFLICT" -> HttpStatus.CONFLICT;
                    case "BAD_GATEWAY" -> HttpStatus.BAD_GATEWAY;
                    case "TOO_MANY_REQUESTS" -> HttpStatus.TOO_MANY_REQUESTS;
                    default -> HttpStatus.INTERNAL_SERVER_ERROR;
                };
        ErrorResponse body = error(ex.getCode(), ex.getMessage());
        if (status == HttpStatus.TOO_MANY_REQUESTS) {
            return ResponseEntity.status(status).header(HttpHeaders.RETRY_AFTER, "60").body(body);
        }
        return ResponseEntity.status(status).body(body);
    }

    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    public ResponseEntity<ErrorResponse> handleNotFound(Exception ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(error("NOT_FOUND", "Resource not found"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(
            MethodArgumentNotValidException ex) {
        String message =
                ex.getBindingResult().getFieldErrors().stream()
                        .map(FieldError::getDefaultMessage)
                        .collect(Collectors.joining("; "));

        return ResponseEntity.badRequest().body(error("BAD_REQUEST", message));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolation(
            ConstraintViolationException ex) {
        return ResponseEntity.badRequest().body(error("BAD_REQUEST", ex.getMessage()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(error("FORBIDDEN", "Access denied"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(error("INTERNAL_ERROR", "Internal server error"));
    }

    private ErrorResponse error(String code, String message) {
        return new ErrorResponse(code, message, RequestContext.ensureRequestId(), Instant.now());
    }
}
