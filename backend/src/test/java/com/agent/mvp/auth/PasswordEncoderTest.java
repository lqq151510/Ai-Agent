package com.agent.mvp.auth;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

class PasswordEncoderTest {

    @Test
    void shouldHashAndMatchPassword() {
        PasswordEncoder encoder = new BCryptPasswordEncoder();
        String raw = "P@ssw0rd123";
        String hashed = encoder.encode(raw);

        assertTrue(encoder.matches(raw, hashed));
        assertFalse(encoder.matches("bad-password", hashed));
    }
}
