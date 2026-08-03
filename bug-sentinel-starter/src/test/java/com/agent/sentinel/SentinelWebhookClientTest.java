package com.agent.sentinel;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SentinelWebhookClientTest {
    @Test
    void disabledOrLegacyNoTokenClientCannotSend() {
        SentinelWebhookClient disabled = new SentinelWebhookClient("http://localhost", "demo", "test", "token", false);
        SentinelWebhookClient legacy = new SentinelWebhookClient("http://localhost", "demo");
        assertFalse(disabled.isEnabled());
        assertFalse(legacy.isEnabled());
        disabled.reportException("Authorization: secret");
        legacy.reportException("Authorization: secret");
    }

    @Test
    void tokenEnabledClientIsEnabled() {
        SentinelWebhookClient client = new SentinelWebhookClient("http://localhost", "demo", "test", "token", true);
        assertTrue(client.isEnabled());
        client.shutdown();
    }

    @Test
    void sendsAuthHeaderAndRedactedPayload() throws Exception {
        SentinelWebhookClient client = new SentinelWebhookClient(
                "http://localhost/sentinel", "demo", "test", "token", true);
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        ReflectionTestUtils.setField(client, "restTemplate", restTemplate);
        server.expect(requestTo("http://localhost/sentinel"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Sentinel token"))
                .andExpect(content().string(org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.containsString("***"),
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("secret")))))
                .andRespond(withSuccess("ok", MediaType.TEXT_PLAIN));

        client.reportException("Authorization: secret password=pwd");
        server.verify(Duration.ofSeconds(2));
        client.shutdown();
    }
}
