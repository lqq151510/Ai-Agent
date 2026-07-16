package com.agent.mvp.agent.service;

import com.agent.mvp.agent.dto.ParsedDocument;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Map;
import java.util.Set;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
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

/**
 * 文档转 Markdown 服务。
 *
 * <p>调用链路：优先调用 {@link PythonParseClient}（python-service，WebClient + 连接池）， 失败时降级到原有 RestTemplate
 * 直连逻辑（向后兼容）。
 *
 * <p>保持原有 {@link #convertDocumentToMarkdown(File)} 方法签名不变。
 */
@Service
public class MarkItDownService {
    private static final Logger log = LoggerFactory.getLogger(MarkItDownService.class);
    private static final Set<String> LOCAL_TEXT_FORMATS =
            Set.of("md", "markdown", "txt", "html", "htm");

    @Value("${markitdown.url:http://localhost:8000/parse}")
    private String markItDownUrl;

    private final RestTemplate restTemplate;

    /** 新增：python-service 客户端（可选依赖，便于测试与降级） */
    private final PythonParseClient pythonParseClient;

    public MarkItDownService(PythonParseClient pythonParseClient) {
        org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(10000);
        this.restTemplate = new RestTemplate(factory);
        this.pythonParseClient = pythonParseClient;
    }

    /**
     * 将文档转换为 Markdown（向后兼容方法）。
     *
     * <p>优先走 python-service（WebClient），失败时降级到 RestTemplate 直连。
     *
     * @param file 待转换文件
     * @return Markdown 文本
     */
    public String convertDocumentToMarkdown(File file) {
        if (!file.exists()) {
            throw new IllegalArgumentException("File does not exist: " + file.getAbsolutePath());
        }

        // 优先尝试 python-service（结构化解析）
        try {
            ParsedDocument parsed = parseViaPythonService(file);
            if (parsed != null && parsed.markdown() != null) {
                log.info(
                        "通过 python-service 解析成功: {}, sourceFormat={}",
                        file.getName(),
                        parsed.sourceFormat());
                return parsed.markdown();
            }
        } catch (PythonParseClient.PythonServiceUnavailableException e) {
            log.warn("python-service 不可用，降级到本地 RestTemplate 直连: {}", e.getMessage());
        } catch (Exception e) {
            log.warn("调用 python-service 异常，降级到本地 RestTemplate 直连: {}", e.getMessage());
        }

        try {
            return parseLocally(file).markdown();
        } catch (UnsupportedOperationException e) {
            log.warn("本地解析不支持 {}，尝试 RestTemplate 兼容路径", file.getName());
        } catch (Exception e) {
            log.warn("本地解析失败，尝试 RestTemplate 兼容路径: {}", e.getMessage());
        }

        // 最后降级：原有 RestTemplate 逻辑
        return convertViaRestTemplate(file);
    }

    /**
     * 新增：解析文档并返回结构化结果（包含 metadata、sourceFormat）。
     *
     * <p>失败时同样降级到 RestTemplate，但 metadata 为空。
     *
     * @param file 待解析文件
     * @return 解析结果
     */
    public ParsedDocument parseDocument(File file) {
        if (!file.exists()) {
            throw new IllegalArgumentException("File does not exist: " + file.getAbsolutePath());
        }

        try {
            ParsedDocument parsed = parseViaPythonService(file);
            if (parsed != null && parsed.markdown() != null) {
                return parsed;
            }
        } catch (PythonParseClient.PythonServiceUnavailableException e) {
            log.warn("python-service 不可用，降级到本地 RestTemplate 直连: {}", e.getMessage());
        } catch (Exception e) {
            log.warn("调用 python-service 异常，降级到本地 RestTemplate 直连: {}", e.getMessage());
        }

        try {
            return parseLocally(file);
        } catch (UnsupportedOperationException e) {
            log.warn("本地解析不支持 {}，尝试 RestTemplate 兼容路径", file.getName());
        } catch (Exception e) {
            log.warn("本地解析失败，尝试 RestTemplate 兼容路径: {}", e.getMessage());
        }

        String markdown = convertViaRestTemplate(file);
        return ParsedDocument.ofLocal(file.getName(), markdown);
    }

    /** 通过 PythonParseClient 调用 python-service。 */
    private ParsedDocument parseViaPythonService(File file) {
        try {
            byte[] content = Files.readAllBytes(file.toPath());
            return pythonParseClient.parse(content, file.getName());
        } catch (java.io.IOException e) {
            throw new PythonParseClient.PythonServiceUnavailableException(
                    "读取文件失败: " + file.getName(), e);
        }
    }

    private ParsedDocument parseLocally(File file) throws IOException {
        String format = ParsedDocument.inferSourceFormat(file.getName());
        if (LOCAL_TEXT_FORMATS.contains(format)) {
            return ParsedDocument.ofLocal(
                    file.getName(), Files.readString(file.toPath(), StandardCharsets.UTF_8));
        }
        if ("pdf".equals(format)) {
            return ParsedDocument.ofLocal(file.getName(), extractPdfText(file));
        }
        throw new UnsupportedOperationException("Unsupported local document format: " + format);
    }

    private String extractPdfText(File file) throws IOException {
        try (PDDocument document = Loader.loadPDF(file)) {
            return new PDFTextStripper().getText(document);
        }
    }

    /** 原有 RestTemplate 直连逻辑（降级路径）。 */
    private String convertViaRestTemplate(File file) {
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
