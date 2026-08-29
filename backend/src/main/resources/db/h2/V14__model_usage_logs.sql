CREATE TABLE IF NOT EXISTS model_usage_logs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    model_source_id UUID,
    provider_type VARCHAR(32) NOT NULL,
    model_name VARCHAR(160) NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(24) NOT NULL DEFAULT 'success',
    error_message VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_model_usage_logs_user
        FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_model_usage_logs_source
        FOREIGN KEY (model_source_id) REFERENCES model_sources (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_model_usage_logs_user_created
    ON model_usage_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_usage_logs_user_provider
    ON model_usage_logs(user_id, provider_type);
