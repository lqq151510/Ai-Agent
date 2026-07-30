ALTER TABLE knowledge_items ADD COLUMN content_hash VARCHAR(64);

CREATE UNIQUE INDEX uq_knowledge_items_user_content_hash
    ON knowledge_items(user_id, content_hash);
