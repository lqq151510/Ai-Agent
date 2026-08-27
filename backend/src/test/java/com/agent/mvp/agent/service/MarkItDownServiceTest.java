package com.agent.mvp.agent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.agent.mvp.agent.dto.ParsedDocument;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

class MarkItDownServiceTest {

    @TempDir Path tempDir;

    @Test
    void conversionMethodsShouldRejectMissingFiles() {
        MarkItDownService service = new MarkItDownService(mock(PythonParseClient.class));
        var missing = tempDir.resolve("missing.md").toFile();

        assertThrows(
                IllegalArgumentException.class, () -> service.convertDocumentToMarkdown(missing));
        assertThrows(IllegalArgumentException.class, () -> service.parseDocument(missing));
    }

    @Test
    void conversionMethodsShouldReturnStructuredPythonResult() throws Exception {
        PythonParseClient client = mock(PythonParseClient.class);
        MarkItDownService service = new MarkItDownService(client);
        Path file = Files.writeString(tempDir.resolve("notes.md"), "local");
        ParsedDocument parsed =
                new ParsedDocument("notes.md", "remote markdown", "md", Map.of("pages", "1"));
        when(client.parse(any(byte[].class), anyString())).thenReturn(parsed);

        assertEquals("remote markdown", service.convertDocumentToMarkdown(file.toFile()));
        assertEquals(parsed, service.parseDocument(file.toFile()));
    }

    @Test
    void conversionMethodsShouldFallBackToLocalTextForClientFailures() throws Exception {
        PythonParseClient client = mock(PythonParseClient.class);
        MarkItDownService service = new MarkItDownService(client);
        Path file = Files.writeString(tempDir.resolve("notes.txt"), "local text");
        when(client.parse(any(byte[].class), anyString()))
                .thenThrow(new PythonParseClient.PythonServiceUnavailableException("offline"))
                .thenThrow(new IllegalStateException("unexpected"));

        assertEquals("local text", service.convertDocumentToMarkdown(file.toFile()));
        ParsedDocument parsed = service.parseDocument(file.toFile());
        assertEquals("local text", parsed.markdown());
        assertEquals("txt", parsed.sourceFormat());
    }

    @Test
    void conversionMethodsShouldFallBackWhenPythonReturnsIncompleteResult() throws Exception {
        PythonParseClient client = mock(PythonParseClient.class);
        MarkItDownService service = new MarkItDownService(client);
        Path file = Files.writeString(tempDir.resolve("notes.html"), "<p>local</p>");
        when(client.parse(any(byte[].class), anyString()))
                .thenReturn(null)
                .thenReturn(new ParsedDocument("notes.html", null, "html", Map.of()));

        assertEquals("<p>local</p>", service.convertDocumentToMarkdown(file.toFile()));
        assertEquals("<p>local</p>", service.parseDocument(file.toFile()).markdown());
    }

    @Test
    void parseDocumentShouldSupportLocalPdfFallback() throws Exception {
        PythonParseClient client = mock(PythonParseClient.class);
        MarkItDownService service = new MarkItDownService(client);
        Path pdf = tempDir.resolve("empty.pdf");
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            document.save(pdf.toFile());
        }
        when(client.parse(any(byte[].class), anyString()))
                .thenThrow(new PythonParseClient.PythonServiceUnavailableException("offline"));

        ParsedDocument parsed = service.parseDocument(pdf.toFile());

        assertEquals("pdf", parsed.sourceFormat());
        assertTrue(parsed.markdown().isBlank());
    }

    @Test
    void unsupportedFormatsShouldUseRestTemplateCompatibilityFallback() throws Exception {
        PythonParseClient client = mock(PythonParseClient.class);
        MarkItDownService service = serviceWithUrl(client);
        Path file = Files.writeString(tempDir.resolve("notes.docx"), "binary-ish");
        when(client.parse(any(byte[].class), anyString()))
                .thenThrow(new PythonParseClient.PythonServiceUnavailableException("offline"));
        RestTemplate restTemplate =
                (RestTemplate) ReflectionTestUtils.getField(service, "restTemplate");
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("http://parser.test/parse"))
                .andRespond(
                        withSuccess(
                                "{\"markdown\":\"remote fallback\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://parser.test/parse"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        assertEquals("remote fallback", service.convertDocumentToMarkdown(file.toFile()));
        assertEquals("", service.parseDocument(file.toFile()).markdown());
        server.verify();
    }

    private static MarkItDownService serviceWithUrl(PythonParseClient client) {
        MarkItDownService service = new MarkItDownService(client);
        ReflectionTestUtils.setField(service, "markItDownUrl", "http://parser.test/parse");
        return service;
    }
}
