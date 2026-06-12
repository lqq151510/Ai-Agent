import re

with open("backend/src/main/java/com/agent/mvp/agent/service/AgentService.java", "r") as f:
    content = f.read()

new_sanitize = """    private String sanitizeSystemContext(String systemContext, int tokenBudget) {
        if (systemContext == null || systemContext.isBlank()) {
            return "";
        }

        String[] lines = systemContext.replace("\\r\\n", "\\n").split("\\n");
        StringBuilder sb = new StringBuilder();
        java.util.regex.Pattern sensitivePattern = java.util.regex.Pattern.compile("(?i)(token|secret|password|api[_-]?key|authorization|refresh[_-]?token|cookie)");
        
        for (String line : lines) {
            if (sensitivePattern.matcher(line).find()) {
                sb.append("[redacted sensitive line]\\n");
            } else {
                sb.append(line).append("\\n");
            }
        }
        String sanitized = sb.toString();

        sanitized = sanitized
                .replaceAll("Bearer\\\\s+[A-Za-z0-9._-]+", "Bearer [redacted]")
                .replaceAll("(?i)sk-[A-Za-z0-9]+", "sk-[redacted]")
                .replaceAll("[^\\\\x09\\\\x0A\\\\x0D\\\\x20-\\\\x7E]", "")
                .replaceAll("\\\\n{3,}", "\\n\\n")
                .trim();

        int currentTokens = TokenCounter.countTokens(sanitized);
        if (currentTokens > tokenBudget) {
            double ratio = (double) tokenBudget / currentTokens;
            int estimatedSafeLength = (int) (sanitized.length() * ratio * 0.95);
            sanitized = sanitized.substring(0, Math.max(0, estimatedSafeLength)).trim();
            while (!sanitized.isBlank() && TokenCounter.countTokens(sanitized) > tokenBudget) {
                sanitized = sanitized.substring(0, Math.max(0, sanitized.length() - 50)).trim();
            }
        }

        return sanitized;
    }"""

# regex matching the old sanitizeSystemContext
old_sanitize_pattern = r'private String sanitizeSystemContext\(String systemContext, int tokenBudget\) \{.*?return sanitized;\n    \}'
content = re.sub(old_sanitize_pattern, new_sanitize, content, flags=re.DOTALL)

with open("backend/src/main/java/com/agent/mvp/agent/service/AgentService.java", "w") as f:
    f.write(content)
print("AgentService Sanitizer Fixed")
