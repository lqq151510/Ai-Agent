package com.agent.mvp.config;

import com.agent.mvp.auth.security.JwtAuthenticationFilter;
import com.agent.mvp.common.context.RequestContext;
import com.agent.mvp.common.context.RequestContextFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final AppProperties appProperties;
    private final RequestContextFilter requestContextFilter;
    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final SentinelRequestFilter sentinelRequestFilter;
    private final ObjectMapper objectMapper;

    public SecurityConfig(
            AppProperties appProperties,
            RequestContextFilter requestContextFilter,
            JwtAuthenticationFilter jwtAuthenticationFilter,
            SentinelRequestFilter sentinelRequestFilter,
            ObjectMapper objectMapper) {
        this.appProperties = appProperties;
        this.requestContextFilter = requestContextFilter;
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.sentinelRequestFilter = sentinelRequestFilter;
        this.objectMapper = objectMapper;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults())
                .httpBasic(httpBasic -> httpBasic.disable())
                .formLogin(formLogin -> formLogin.disable())
                .logout(logout -> logout.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(
                        auth ->
                                auth.requestMatchers(
                                                "/api/v1/auth/login",
                                                "/api/v1/auth/register",
                                                "/api/v1/auth/refresh",
                                                "/api/v1/system/health/ready",
                                                "/actuator/health/liveness")
                                        .permitAll()
                                        .anyRequest()
                                        .authenticated())
                .exceptionHandling(
                        exception ->
                                exception.authenticationEntryPoint(
                                        (request, response, authException) -> {
                                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                                            response.setContentType(
                                                    MediaType.APPLICATION_JSON_VALUE);
                                            response.setHeader(
                                                    HttpHeaders.WWW_AUTHENTICATE, "Bearer");
                                            String requestId = RequestContext.ensureRequestId();
                                            response.setHeader(
                                                    RequestContext.REQUEST_ID_HEADER, requestId);
                                            response.getWriter()
                                                    .write(
                                                            objectMapper.writeValueAsString(
                                                                    Map.of(
                                                                            "code",
                                                                            "UNAUTHORIZED",
                                                                            "message",
                                                                            "Authentication"
                                                                                    + " required",
                                                                            "requestId",
                                                                            requestId)));
                                        }))
                .addFilterBefore(requestContextFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(sentinelRequestFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(
                        jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public UserDetailsService userDetailsService() {
        return username -> {
            throw new UsernameNotFoundException("Local password login is handled by AuthService");
        };
    }

    @Bean
    @org.springframework.context.annotation.Profile("!desktop")
    public CorsConfigurationSource corsConfigurationSource() {
        List<String> allowedOrigins =
                appProperties.getCors().getAllowedOrigins().stream()
                        .filter(origin -> origin != null && !origin.isBlank())
                        .toList();
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    @org.springframework.context.annotation.Profile("desktop")
    public CorsConfigurationSource desktopCorsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(
                java.util.List.of("file://*", "http://localhost:5173", "http://127.0.0.1:5173"));
        configuration.setAllowedMethods(
                java.util.List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(java.util.List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
