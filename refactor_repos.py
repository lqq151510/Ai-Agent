import os
import re

files = [
    "backend/src/main/java/com/agent/mvp/tooling/repo/ToolAuditRepository.java",
    "backend/src/main/java/com/agent/mvp/auth/repo/UserRepository.java",
    "backend/src/main/java/com/agent/mvp/coach/repo/DevCoachRunRepository.java",
    "backend/src/main/java/com/agent/mvp/session/repo/MessageRepository.java",
    "backend/src/main/java/com/agent/mvp/session/repo/ConversationSessionRepository.java"
]

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()

    # Change imports
    content = re.sub(r'import org\.springframework\.data\.jpa\.repository\.JpaRepository;', 'import com.baomidou.mybatisplus.core.mapper.BaseMapper;\nimport org.apache.ibatis.annotations.Mapper;', content)
    content = re.sub(r'import org\.springframework\.data\.domain\.Pageable;\n', '', content)
    content = re.sub(r'import org\.springframework\.data\.domain\.Page;\n', '', content)
    content = re.sub(r'import org\.springframework\.data\.jpa\.repository\.[a-zA-Z]+;\n', '', content)
    content = re.sub(r'import org\.springframework\.data\.repository\.query\.Param;\n', '', content)

    # Change extension
    content = re.sub(r'extends JpaRepository<([^,]+),\s*[^>]+>', r'extends BaseMapper<\1>', content)
    
    # Add @Mapper
    content = re.sub(r'public interface', r'@Mapper\npublic interface', content)

    # We will remove all methods from the interfaces so we can implement them in the service layer
    # because BaseMapper doesn't support Spring Data method name parsing.
    content = re.sub(r'\{[^}]+\}', '{\n}', content)

    with open(file_path, 'w') as f:
        f.write(content)
print("Done")
