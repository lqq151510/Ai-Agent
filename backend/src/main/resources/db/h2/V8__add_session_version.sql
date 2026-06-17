-- 对齐 PostgreSQL V8__add_session_version.sql
-- 会话乐观锁版本字段（@Version 注解对应列）
ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
