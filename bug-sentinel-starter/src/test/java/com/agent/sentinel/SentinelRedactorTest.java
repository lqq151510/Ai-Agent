package com.agent.sentinel;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class SentinelRedactorTest {
    @Test
    void redactsCommonCredentialFormatsAndTruncates() {
        String result = SentinelRedactor.redact(
                "Bearer abc authorization: def password=pwd api-key: key private_key=private cookie=c token=tok", 40);
        assertTrue(result.length() <= 40);
        assertFalse(result.contains("abc"));
        assertFalse(result.contains("def"));
        assertFalse(result.contains("pwd"));
    }
}
