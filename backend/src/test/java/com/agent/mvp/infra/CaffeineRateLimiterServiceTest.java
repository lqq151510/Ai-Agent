package com.agent.mvp.infra;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CaffeineRateLimiterServiceTest {

    @Test
    void shouldAllowWithinWindowAndResetAfterWindowExpires() throws InterruptedException {
        CaffeineRateLimiterService service = new CaffeineRateLimiterService(Duration.ofSeconds(1), 100);

        assertTrue(service.allow("desktop:rate-limit", 2, Duration.ofMillis(120)));
        assertTrue(service.allow("desktop:rate-limit", 2, Duration.ofMillis(120)));
        assertFalse(service.allow("desktop:rate-limit", 2, Duration.ofMillis(120)));

        Thread.sleep(160);

        assertTrue(service.allow("desktop:rate-limit", 2, Duration.ofMillis(120)));
    }
}
