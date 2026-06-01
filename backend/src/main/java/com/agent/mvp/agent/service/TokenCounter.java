package com.agent.mvp.agent.service;

import com.knuddels.jtokkit.Encodings;
import com.knuddels.jtokkit.api.Encoding;
import com.knuddels.jtokkit.api.EncodingRegistry;
import com.knuddels.jtokkit.api.EncodingType;

public class TokenCounter {
    private static final EncodingRegistry registry = Encodings.newDefaultEncodingRegistry();
    private static final Encoding encoding = registry.getEncoding(EncodingType.CL100K_BASE);

    public static int countTokens(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        return encoding.countTokens(text);
    }
}
