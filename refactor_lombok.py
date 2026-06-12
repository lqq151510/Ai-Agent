import os
import re

files = [
    "backend/src/main/java/com/agent/mvp/tooling/entity/ToolAudit.java",
    "backend/src/main/java/com/agent/mvp/auth/entity/User.java",
    "backend/src/main/java/com/agent/mvp/coach/entity/DevCoachRun.java",
    "backend/src/main/java/com/agent/mvp/session/entity/Message.java",
    "backend/src/main/java/com/agent/mvp/session/entity/ConversationSession.java",
    "backend/src/main/java/com/agent/mvp/common/context/RequestContext.java"
]

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()

    # Remove getters
    content = re.sub(r'public\s+[\w<>]+\s+get[A-Z][\w]+\(\)\s*\{[^}]*\}', '', content)
    content = re.sub(r'public\s+boolean\s+is[A-Z][\w]+\(\)\s*\{[^}]*\}', '', content)
    # Remove setters
    content = re.sub(r'public\s+void\s+set[A-Z][\w]+\([^)]+\)\s*\{[^}]*\}', '', content)
    
    # Add imports
    if 'lombok.Data' not in content:
        content = re.sub(r'(package [^;]+;)', r'\1\n\nimport lombok.Data;\nimport lombok.NoArgsConstructor;\nimport lombok.AllArgsConstructor;\nimport lombok.Builder;', content, 1)

    # Add annotations before class definition
    content = re.sub(r'(public class)', r'@Data\n@NoArgsConstructor\n@AllArgsConstructor\n@Builder\n\1', content)

    # remove empty lines
    content = re.sub(r'\n{3,}', '\n\n', content)

    with open(file_path, 'w') as f:
        f.write(content)
print("Done")
