-- 对齐 PostgreSQL V7__add_session_workflow_fields.sql
-- 会话工作流字段：任务类型、目标、状态
ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS task_type VARCHAR(24);
ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS task_goal VARCHAR(160);
ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS task_status VARCHAR(24);

-- 回填默认值，避免已有会话字段为 NULL
UPDATE conversation_sessions
SET task_type = COALESCE(task_type, 'chat'),
    task_status = COALESCE(task_status, 'planned')
WHERE task_type IS NULL
   OR task_status IS NULL;
