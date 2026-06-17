-- 补充 conversation_sessions 表的乐观锁版本字段
-- ConversationSession 实体使用 @Version 注解，但 schema 缺少对应列
ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
