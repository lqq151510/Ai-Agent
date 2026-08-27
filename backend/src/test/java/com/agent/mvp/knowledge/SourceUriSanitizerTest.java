package com.agent.mvp.knowledge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class SourceUriSanitizerTest {

    @Test
    void sanitizeShouldPreserveWebUrlsAndHideLocalPaths() {
        assertNull(SourceUriSanitizer.sanitize(null));
        assertNull(SourceUriSanitizer.sanitize("  "));
        assertEquals(
                "https://example.com/notes?id=1",
                SourceUriSanitizer.sanitize(" https://example.com/notes?id=1 "));
        assertEquals(
                "HTTP://example.com/notes",
                SourceUriSanitizer.sanitize("HTTP://example.com/notes"));
        assertEquals(
                "upload://private.md",
                SourceUriSanitizer.sanitize("file:///Users/zebao/private.md"));
        assertEquals(
                "upload://notes.txt", SourceUriSanitizer.sanitize("C:\\Users\\zebao\\notes.txt"));
    }

    @Test
    void safeBasenameShouldNormalizeSchemesEncodingAndSuffixes() {
        assertEquals("local-file", SourceUriSanitizer.safeBasename(null, null));
        assertEquals("fallback", SourceUriSanitizer.safeBasename(" ", " fallback "));
        assertEquals(
                "RAG notes.md",
                SourceUriSanitizer.safeBasename(
                        "upload://folder/RAG%20notes.md?download=1#section", "fallback"));
        assertEquals(
                "notes.md",
                SourceUriSanitizer.safeBasename("FILE:C:\\private\\notes.md#fragment", "fallback"));
        assertEquals("fallback", SourceUriSanitizer.safeBasename("/folder/..", "fallback"));
        assertEquals("fallback", SourceUriSanitizer.safeBasename("/folder/.", "fallback"));
        assertEquals("fallback", SourceUriSanitizer.safeBasename("/folder/", "fallback"));
        assertEquals("bad%2", SourceUriSanitizer.safeBasename("/folder/bad%2", "fallback"));
        assertEquals("plain.txt", SourceUriSanitizer.safeBasename("plain.txt", "fallback"));
    }

    @Test
    void displayNameShouldHandleEmptyUploadedAndRemoteSources() {
        assertEquals("Untitled", SourceUriSanitizer.displayName(null));
        assertEquals("Untitled", SourceUriSanitizer.displayName(" "));
        assertEquals("notes.md", SourceUriSanitizer.displayName("UPLOAD://folder/notes.md"));
        assertEquals(
                "https://example.com/notes",
                SourceUriSanitizer.displayName("https://example.com/notes"));
    }
}
