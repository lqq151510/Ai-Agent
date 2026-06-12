package com.agent.mvp.agent.service;

import java.io.File;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

@Service
public class MarkItDownService {
    private static final Logger log = LoggerFactory.getLogger(MarkItDownService.class);

    @Value("${markitdown.url:http://localhost:8000/parse}")
    private String markItDownUrl;

    private final RestTemplate restTemplate;

    public MarkItDownService() {
        org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(10000);
        this.restTemplate = new RestTemplate(factory);
    }

    /**
     * Converts a document to Markdown by calling the Python MarkItDown service.
     *
     * @param file The file to convert.
     * @return The converted Markdown text.
     */
    public String convertDocumentToMarkdown(File file) {
        if (!file.exists()) {
            throw new IllegalArgumentException("File does not exist: " + file.getAbsolutePath());
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", new FileSystemResource(file));

            HttpEntity<MultiValueMap<String, Object>> requestEntity =
                    new HttpEntity<>(body, headers);

            log.info("Sending file {} to MarkItDown service at {}", file.getName(), markItDownUrl);
            ResponseEntity<Map> response =
                    restTemplate.postForEntity(markItDownUrl, requestEntity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object markdownObj = response.getBody().get("markdown");
                return markdownObj != null ? String.valueOf(markdownObj) : "";
            } else {
                throw new RuntimeException(
                        "Failed to convert document. Status: " + response.getStatusCode());
            }
        } catch (Exception e) {
            log.error("Error calling MarkItDown service: {}", e.getMessage(), e);
            throw new RuntimeException("Error calling MarkItDown service", e);
        }
    }
}
