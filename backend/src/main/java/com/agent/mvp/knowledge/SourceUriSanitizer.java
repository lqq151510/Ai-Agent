package com.agent.mvp.knowledge;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Keeps public knowledge-item source URIs free of local paths. The desktop main process owns real
 * locations; the backend may retain only a stable display URI for locally supplied files.
 */
public final class SourceUriSanitizer {

    private static final String UPLOAD_URI_PREFIX = "upload://";

    private SourceUriSanitizer() {}

    public static String sanitize(String sourceUri) {
        if (sourceUri == null || sourceUri.isBlank()) {
            return null;
        }
        String trimmed = sourceUri.trim();
        if (isHttpUri(trimmed)) {
            return trimmed;
        }
        return UPLOAD_URI_PREFIX + safeBasename(trimmed, "local-file");
    }

    public static String safeBasename(String rawValue, String fallback) {
        String normalizedFallback =
                fallback == null || fallback.isBlank() ? "local-file" : fallback.trim();
        if (rawValue == null || rawValue.isBlank()) {
            return normalizedFallback;
        }

        String value = decodeOnce(rawValue.trim());
        int schemeSeparator = value.indexOf(':');
        if (schemeSeparator >= 0 && value.substring(0, schemeSeparator).equalsIgnoreCase("file")) {
            value = value.substring(schemeSeparator + 1);
        } else if (value.regionMatches(true, 0, UPLOAD_URI_PREFIX, 0, UPLOAD_URI_PREFIX.length())) {
            value = value.substring(UPLOAD_URI_PREFIX.length());
        }

        int queryIndex = firstPositive(value.indexOf('?'), value.indexOf('#'));
        if (queryIndex >= 0) {
            value = value.substring(0, queryIndex);
        }
        value = value.replace('\\', '/');
        int lastSlash = value.lastIndexOf('/');
        String basename = lastSlash >= 0 ? value.substring(lastSlash + 1) : value;
        basename = basename.trim();
        if (basename.isBlank() || ".".equals(basename) || "..".equals(basename)) {
            return normalizedFallback;
        }
        return basename;
    }

    public static String displayName(String sanitizedSourceUri) {
        if (sanitizedSourceUri == null || sanitizedSourceUri.isBlank()) {
            return "Untitled";
        }
        if (sanitizedSourceUri.regionMatches(
                true, 0, UPLOAD_URI_PREFIX, 0, UPLOAD_URI_PREFIX.length())) {
            return safeBasename(sanitizedSourceUri, "Untitled");
        }
        return sanitizedSourceUri;
    }

    private static boolean isHttpUri(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        return lower.startsWith("http://") || lower.startsWith("https://");
    }

    private static int firstPositive(int first, int second) {
        if (first < 0) {
            return second;
        }
        if (second < 0) {
            return first;
        }
        return Math.min(first, second);
    }

    private static String decodeOnce(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ignored) {
            return value;
        }
    }
}
