package com.agent.mvp.auth;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.agent.mvp.auth.dto.RegisterRequest;
import com.agent.mvp.auth.service.AuthService;
import com.agent.mvp.common.ApiExceptionHandler;
import com.agent.mvp.config.AppProperties;
import com.agent.mvp.infra.RateLimiterService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class AuthControllerTest {

    private AuthService authService;
    private RateLimiterService rateLimiterService;
    private AppProperties appProperties;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        rateLimiterService = mock(RateLimiterService.class);
        appProperties = new AppProperties();

        AuthController authController =
                new AuthController(authService, rateLimiterService, appProperties);
        // 绑定全局异常处理器与 Jackson 转换器，确保 ApiException (429) 和 DTO 校验异常 (400) 能正确序列化为 JSON 返回
        mockMvc =
                MockMvcBuilders.standaloneSetup(authController)
                        .setControllerAdvice(new ApiExceptionHandler())
                        .setMessageConverters(new MappingJackson2HttpMessageConverter())
                        .build();
    }

    @Test
    void shouldRegisterSuccessfullyWithStrongPassword() throws Exception {
        RegisterRequest request = new RegisterRequest("test@example.com", "StrongP@ss123");

        // 允许注册频率
        when(rateLimiterService.allow(any(), eq(10L), any(Duration.class))).thenReturn(true);

        mockMvc.perform(
                        post("/api/v1/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(new ObjectMapper().writeValueAsString(request)))
                .andExpect(status().isOk());
    }

    @Test
    void shouldReturnBadRequestWhenPasswordIsWeak() throws Exception {
        // 弱密码：缺少特殊字符
        RegisterRequest request = new RegisterRequest("test@example.com", "WeakPassword123");

        mockMvc.perform(
                        post("/api/v1/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(new ObjectMapper().writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"))
                .andExpect(
                        jsonPath("$.message")
                                .value(
                                        "Password must include upper/lowercase letters, digits and"
                                                + " special characters"));
    }

    @Test
    void shouldReturnBadRequestWhenPasswordIsTooShort() throws Exception {
        // 密码过短
        RegisterRequest request = new RegisterRequest("test@example.com", "Sh1!");

        mockMvc.perform(
                        post("/api/v1/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(new ObjectMapper().writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }

    @Test
    void shouldReturnTooManyRequestsWhenLimitExceeded() throws Exception {
        RegisterRequest request = new RegisterRequest("test@example.com", "StrongP@ss123");

        // 模拟 IP 被限流
        when(rateLimiterService.allow(
                        eq("ratelimit:register:ip:127.0.0.1"), eq(10L), any(Duration.class)))
                .thenReturn(false);

        mockMvc.perform(
                        post("/api/v1/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(new ObjectMapper().writeValueAsString(request))
                                .with(
                                        servletRequest -> {
                                            servletRequest.setRemoteAddr("127.0.0.1");
                                            return servletRequest;
                                        }))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"))
                .andExpect(jsonPath("$.message").value("Too many register attempts"));
    }
}
