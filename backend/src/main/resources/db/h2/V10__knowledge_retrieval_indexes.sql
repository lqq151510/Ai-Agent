CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_updated
    ON knowledge_items(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_source_updated
    ON knowledge_items(user_id, source_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_status_updated
    ON knowledge_items(user_id, status, updated_at DESC);
