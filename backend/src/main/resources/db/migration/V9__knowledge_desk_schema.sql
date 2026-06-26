CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY,
    display_name VARCHAR(120),
    avatar_url VARCHAR(500),
    default_model_source_id UUID,
    summary_model_source_id UUID,
    tagging_model_source_id UUID,
    organize_mode VARCHAR(24) NOT NULL DEFAULT 'manual',
    privacy_mode VARCHAR(24) NOT NULL DEFAULT 'local_first',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE model_sources (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    provider_type VARCHAR(32) NOT NULL,
    name VARCHAR(120) NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    api_key VARCHAR(1024) NOT NULL,
    default_model VARCHAR(160) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    last_check_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
    last_check_message VARCHAR(500),
    last_checked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_model_sources_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE knowledge_items (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    source_type VARCHAR(24) NOT NULL,
    title VARCHAR(240) NOT NULL,
    source_uri VARCHAR(800),
    raw_content TEXT NOT NULL,
    cleaned_content TEXT,
    summary TEXT,
    status VARCHAR(24) NOT NULL,
    language VARCHAR(16),
    word_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_knowledge_items_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE knowledge_tags (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name VARCHAR(80) NOT NULL,
    color VARCHAR(24),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_knowledge_tags_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE knowledge_item_tags (
    knowledge_item_id UUID NOT NULL,
    tag_id UUID NOT NULL,
    CONSTRAINT fk_knowledge_item_tags_item FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items (id),
    CONSTRAINT fk_knowledge_item_tags_tag FOREIGN KEY (tag_id) REFERENCES knowledge_tags (id),
    CONSTRAINT uq_knowledge_item_tags UNIQUE (knowledge_item_id, tag_id)
);

CREATE TABLE ingestion_jobs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    knowledge_item_id UUID NOT NULL,
    job_type VARCHAR(24) NOT NULL,
    status VARCHAR(24) NOT NULL,
    input_snapshot TEXT,
    result_snapshot TEXT,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_ingestion_jobs_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_ingestion_jobs_item FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items (id)
);

CREATE INDEX idx_model_sources_user_created ON model_sources(user_id, created_at DESC);
CREATE UNIQUE INDEX uq_model_sources_user_name ON model_sources(user_id, name);
CREATE INDEX idx_knowledge_items_user_status_updated ON knowledge_items(user_id, status, updated_at DESC);
CREATE INDEX idx_knowledge_items_user_source_type ON knowledge_items(user_id, source_type);
CREATE INDEX idx_knowledge_items_user_created ON knowledge_items(user_id, created_at DESC);
CREATE UNIQUE INDEX uq_knowledge_tags_user_name ON knowledge_tags(user_id, name);
CREATE INDEX idx_knowledge_item_tags_tag_id ON knowledge_item_tags(tag_id);
CREATE INDEX idx_ingestion_jobs_user_created ON ingestion_jobs(user_id, created_at DESC);
CREATE INDEX idx_ingestion_jobs_item_created ON ingestion_jobs(knowledge_item_id, created_at DESC);
