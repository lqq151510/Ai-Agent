import re

with open('backend/src/main/java/com/agent/mvp/tooling/service/ToolAuditService.java', 'r') as f:
    content = f.read()

# Make it extend ServiceImpl
if 'extends ServiceImpl' not in content:
    content = content.replace('import org.springframework.stereotype.Service;', 'import org.springframework.stereotype.Service;\nimport com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;\nimport org.springframework.kafka.core.KafkaTemplate;\nimport com.fasterxml.jackson.databind.ObjectMapper;')
    content = content.replace('public class ToolAuditService {', 'public class ToolAuditService extends ServiceImpl<ToolAuditRepository, ToolAudit> {')

# Add KafkaTemplate and ObjectMapper
if 'private final KafkaTemplate' not in content:
    content = content.replace('private final ToolAuditRepository toolAuditRepository;', 
                              'private final ToolAuditRepository toolAuditRepository;\n    private final KafkaTemplate<String, String> kafkaTemplate;\n    private final ObjectMapper objectMapper;')
    
    constructor_old = '''    public ToolAuditService(ToolAuditRepository toolAuditRepository) {
        this.toolAuditRepository = toolAuditRepository;
    }'''
    constructor_new = '''    public ToolAuditService(ToolAuditRepository toolAuditRepository, KafkaTemplate<String, String> kafkaTemplate, ObjectMapper objectMapper) {
        this.toolAuditRepository = toolAuditRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }'''
    content = content.replace(constructor_old, constructor_new)

# Modify saveAll to use Kafka
old_save_loop = '''        for(ToolAudit audit : audits) {
            audit.onCreate();
            toolAuditRepository.insert(audit);
        }'''
new_save_loop = '''        for(ToolAudit audit : audits) {
            audit.onCreate();
            try {
                kafkaTemplate.send("tool-audit-events", objectMapper.writeValueAsString(audit));
            } catch(Exception e) {
                e.printStackTrace();
            }
        }'''
content = content.replace(old_save_loop, new_save_loop)

with open('backend/src/main/java/com/agent/mvp/tooling/service/ToolAuditService.java', 'w') as f:
    f.write(content)
