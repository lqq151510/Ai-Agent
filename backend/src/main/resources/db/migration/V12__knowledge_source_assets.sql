CREATE TABLE knowledge_source_assets (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    knowledge_item_id UUID NOT NULL,
    content_hash VARCHAR(64),
    original_filename VARCHAR(512) NOT NULL,
    media_type VARCHAR(120) NOT NULL,
    byte_size BIGINT NOT NULL,
    origin VARCHAR(32) NOT NULL,
    availability VARCHAR(24) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_knowledge_source_assets_user
        FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_knowledge_source_assets_item
        FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items (id),
    CONSTRAINT uq_knowledge_source_assets_item UNIQUE (knowledge_item_id),
    CONSTRAINT ck_knowledge_source_assets_byte_size CHECK (byte_size >= 0),
    CONSTRAINT ck_knowledge_source_assets_origin
        CHECK (origin IN ('picker', 'watched_folder')),
    CONSTRAINT ck_knowledge_source_assets_availability
        CHECK (availability IN ('pending', 'available', 'missing')),
    CONSTRAINT ck_knowledge_source_assets_hash_for_present_original
        CHECK (availability = 'missing' OR content_hash IS NOT NULL)
);

CREATE INDEX idx_knowledge_source_assets_user_created
    ON knowledge_source_assets(user_id, created_at DESC);
