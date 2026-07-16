package com.agent.mvp.agent.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.Collections;
import java.util.Map;

/**
 * 文档解析结果 DTO。
 *
 * <p>对应 python-service 的 {@code /parse} 接口返回结构： {@code { filename, markdown, sourceFormat, metadata
 * }}。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ParsedDocument(
        String filename, String markdown, String sourceFormat, Map<String, String> metadata) {

    /** 构造一个仅包含 markdown 的简化结果（用于本地降级路径）。 */
    public static ParsedDocument ofLocal(String filename, String markdown) {
        return new ParsedDocument(
                filename, markdown, inferSourceFormat(filename), Collections.emptyMap());
    }

    /** 根据文件名推断源格式（小写扩展名）。 */
    public static String inferSourceFormat(String filename) {
        if (filename == null) {
            return "";
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return "";
        }
        return filename.substring(dot + 1).toLowerCase();
    }
}
