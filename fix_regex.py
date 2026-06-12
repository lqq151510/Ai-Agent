with open("backend/src/main/java/com/agent/mvp/agent/service/AgentService.java", "r") as f:
    content = f.read()

content = content.replace('.replaceAll("Bearer\s+', '.replaceAll("Bearer\\\\s+')
content = content.replace('.replaceAll("[^\x09\x0A\x0D\x20-\x7E]"', '.replaceAll("[^\\\\x09\\\\x0A\\\\x0D\\\\x20-\\\\x7E]"')
content = content.replace('.replaceAll("\n{3,}", "\n\n")', '.replaceAll("\\\\n{3,}", "\\n\\n")')

with open("backend/src/main/java/com/agent/mvp/agent/service/AgentService.java", "w") as f:
    f.write(content)
