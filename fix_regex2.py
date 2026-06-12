import re
with open("backend/src/main/java/com/agent/mvp/agent/service/AgentService.java", "r") as f:
    content = f.read()

# I will just find the block and replace it using string split/join to avoid regex escape issues.
start_str = "String sanitized = sb.toString();"
end_str = ".trim();"

idx1 = content.find(start_str)
idx2 = content.find(end_str, idx1)

if idx1 != -1 and idx2 != -1:
    new_block = start_str + """

        sanitized = sanitized
                .replaceAll("Bearer\\\\s+[A-Za-z0-9._-]+", "Bearer [redacted]")
                .replaceAll("(?i)sk-[A-Za-z0-9]+", "sk-[redacted]")
                .replaceAll("[^\\\\x09\\\\x0A\\\\x0D\\\\x20-\\\\x7E]", "")
                .replaceAll("\\\\n{3,}", "\\\\n\\\\n")
                """
    content = content[:idx1] + new_block + content[idx2:]

with open("backend/src/main/java/com/agent/mvp/agent/service/AgentService.java", "w") as f:
    f.write(content)
