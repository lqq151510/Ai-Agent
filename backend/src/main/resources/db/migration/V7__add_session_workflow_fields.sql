ALTER TABLE conversation_sessions
    ADD COLUMN IF NOT EXISTS task_type VARCHAR(24);

ALTER TABLE conversation_sessions
    ADD COLUMN IF NOT EXISTS task_goal VARCHAR(160);

ALTER TABLE conversation_sessions
    ADD COLUMN IF NOT EXISTS task_status VARCHAR(24);

UPDATE conversation_sessions
SET task_type = COALESCE(task_type, 'chat'),
    task_status = COALESCE(task_status, 'planned')
WHERE task_type IS NULL
   OR task_status IS NULL;
