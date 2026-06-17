-- 对齐 PostgreSQL V6__add_missing_indexes.sql
-- 补充缺失的索引：用户邮箱查询、工具审计按用户查询
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_tool_audits_user_id ON tool_audits(user_id);
