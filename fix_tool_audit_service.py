import re

with open("backend/src/main/java/com/agent/mvp/tooling/service/ToolAuditService.java", "r") as f:
    content = f.read()

content = content.replace("import java.util.UUID;", "import java.util.UUID;\nimport com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;")

content = content.replace("toolAuditRepository.saveAll(audits);", """for(ToolAudit audit : audits) {
            audit.onCreate();
            toolAuditRepository.insert(audit);
        }""")

content = content.replace("""toolAuditRepository.findByUserIdAndCreatedAtAfterOrderByCreatedAtDesc(userId, cutoff)""", """toolAuditRepository.selectList(new LambdaQueryWrapper<ToolAudit>()
                        .eq(ToolAudit::getUserId, userId)
                        .gt(ToolAudit::getCreatedAt, cutoff)
                        .orderByDesc(ToolAudit::getCreatedAt))""")

content = content.replace("""toolAuditRepository.findByUserIdAndSessionIdAndCreatedAtAfterOrderByCreatedAtDesc(userId, sessionId, cutoff)""", """toolAuditRepository.selectList(new LambdaQueryWrapper<ToolAudit>()
                        .eq(ToolAudit::getUserId, userId)
                        .eq(ToolAudit::getSessionId, sessionId)
                        .gt(ToolAudit::getCreatedAt, cutoff)
                        .orderByDesc(ToolAudit::getCreatedAt))""")

with open("backend/src/main/java/com/agent/mvp/tooling/service/ToolAuditService.java", "w") as f:
    f.write(content)
print("ToolAuditService Fixed")
