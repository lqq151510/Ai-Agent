import os
import re

files = [
    "backend/src/main/java/com/agent/mvp/tooling/entity/ToolAudit.java",
    "backend/src/main/java/com/agent/mvp/auth/entity/User.java",
    "backend/src/main/java/com/agent/mvp/coach/entity/DevCoachRun.java",
    "backend/src/main/java/com/agent/mvp/session/entity/Message.java",
    "backend/src/main/java/com/agent/mvp/session/entity/ConversationSession.java",
]

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()

    # Remove jakarta.persistence imports
    content = re.sub(r'import jakarta\.persistence\.[^;]+;\n', '', content)

    # Add mybatis-plus imports
    mp_imports = """import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.IdType;
"""
    content = content.replace('import lombok.Builder;', 'import lombok.Builder;\n\n' + mp_imports)

    # Replace class annotations
    content = re.sub(r'@Entity\s*\n', '', content)
    content = re.sub(r'@Table\(name\s*=\s*"([^"]+)"\)', r'@TableName("\1")', content)

    # Replace field annotations
    content = re.sub(r'@Id', r'@TableId', content)
    content = re.sub(r'@Column\(name\s*=\s*"([^"]+)"[^)]*\)', r'@TableField("\1")', content)
    content = re.sub(r'@Column\([^)]*\)', r'', content) # Remove other @Column

    # Handle StringCryptoConverter
    content = re.sub(r'@jakarta\.persistence\.Convert\(converter\s*=\s*StringCryptoConverter\.class\)', r'/* @TableField(typeHandler = StringCryptoTypeHandler.class) */', content)
    
    # Remove PrePersist since it doesn't work in MyBatis-Plus. We will call it manually in the service layer or rely on DB default if any. Wait, it's better to just keep the method and we'll call it manually.
    content = re.sub(r'@PrePersist', '', content)

    with open(file_path, 'w') as f:
        f.write(content)
print("Done")
