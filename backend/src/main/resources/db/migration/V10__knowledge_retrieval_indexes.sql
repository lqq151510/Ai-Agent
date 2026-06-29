CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_updated
    ON knowledge_items(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_source_updated
    ON knowledge_items(user_id, source_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_status_updated
    ON knowledge_items(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_search_fts
    ON knowledge_items
    USING GIN (
        to_tsvector(
            'simple',
            COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' ||
            COALESCE(NULLIF(cleaned_content, ''), raw_content, '')
        )
    );
