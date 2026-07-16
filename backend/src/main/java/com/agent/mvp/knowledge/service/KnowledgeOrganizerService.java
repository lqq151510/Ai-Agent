package com.agent.mvp.knowledge.service;

import com.agent.mvp.knowledge.entity.KnowledgeItem;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class KnowledgeOrganizerService {

    private static final Pattern TOKEN_PATTERN =
            Pattern.compile("[A-Za-z][A-Za-z0-9.+#_-]{2,}|[\\u4e00-\\u9fa5]{2,8}");

    public OrganizeResult organize(KnowledgeItem item) {
        String cleaned = normalize(item.getRawContent());
        String summary = summarize(cleaned);
        List<String> tags = extractTags(item.getTitle(), cleaned, item.getSourceType());
        String language = detectLanguage(cleaned);
        int wordCount = countWords(cleaned);
        return new OrganizeResult(cleaned, summary, tags, language, wordCount);
    }

    private String normalize(String raw) {
        return raw == null ? "" : raw.replaceAll("\\s+", " ").trim();
    }

    private String summarize(String cleaned) {
        if (cleaned.isBlank()) {
            return "";
        }
        return cleaned.length() <= 220 ? cleaned : cleaned.substring(0, 220) + "...";
    }

    private List<String> extractTags(String title, String cleaned, String sourceType) {
        String seed = (title == null ? "" : title + " ") + cleaned;
        Matcher matcher = TOKEN_PATTERN.matcher(seed);
        Set<String> tags = new LinkedHashSet<>();
        if (sourceType != null && !sourceType.isBlank()) {
            tags.add(sourceType.toLowerCase(Locale.ROOT));
        }
        while (matcher.find() && tags.size() < 5) {
            String token = matcher.group().trim().toLowerCase(Locale.ROOT);
            if (token.length() < 2 || isStopWord(token)) {
                continue;
            }
            tags.add(token);
        }
        return new ArrayList<>(tags);
    }

    private boolean isStopWord(String token) {
        return switch (token) {
            case "http",
                            "https",
                            "www",
                            "com",
                            "html",
                            "from",
                            "with",
                            "that",
                            "this",
                            "have",
                            "will",
                            "your",
                            "the",
                            "and",
                            "for",
                            "are",
                            "not",
                            "you",
                            "pdf",
                            "md" ->
                    true;
            default -> false;
        };
    }

    private String detectLanguage(String cleaned) {
        return cleaned.chars().anyMatch(ch -> ch >= 0x4E00 && ch <= 0x9FFF) ? "zh" : "en";
    }

    private int countWords(String cleaned) {
        if (cleaned.isBlank()) {
            return 0;
        }
        return cleaned.split("\\s+").length;
    }

    public record OrganizeResult(
            String cleanedContent,
            String summary,
            List<String> tags,
            String language,
            int wordCount) {}
}
