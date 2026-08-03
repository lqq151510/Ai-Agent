package com.agent.sentinel;

import java.util.regex.Pattern;

/** Truncates and redacts credentials before diagnostic data leaves the process. */
public final class SentinelRedactor {
    private static final Pattern SECRET =
            Pattern.compile(
                    "(?i)(bearer\\s+|authorization\\s*[:=]\\s*|password\\s*[:=]\\s*|pwd\\s*[:=]\\s*|api[\\s_-]?key\\s*[:=]\\s*|private_key\\s*[:=]\\s*|cookie\\s*[:=]\\s*|token\\s*[:=]\\s*)[^\\s,;)]*");

    private SentinelRedactor() {}

    public static String redact(String value, int maxLength) {
        String result = value == null ? "" : value;
        if (result.length() > maxLength) {
            result = result.substring(0, maxLength);
        }
        result = SECRET.matcher(result).replaceAll("$1***");
        return result.length() > maxLength ? result.substring(0, maxLength) : result;
    }
}
