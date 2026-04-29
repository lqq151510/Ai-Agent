CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE conversation_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    title VARCHAR(120) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    role VARCHAR(32) NOT NULL,
    content TEXT NOT NULL,
    tool_trace TEXT,
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_messages_session FOREIGN KEY (session_id) REFERENCES conversation_sessions (id)
);

CREATE TABLE tool_audits (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    session_id UUID NOT NULL,
    tool_name VARCHAR(120) NOT NULL,
    args_json TEXT,
    status VARCHAR(32) NOT NULL,
    duration_ms BIGINT NOT NULL,
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sessions_user_updated ON conversation_sessions(user_id, updated_at DESC);
CREATE INDEX idx_messages_session_created ON messages(session_id, created_at);
CREATE INDEX idx_tool_audits_session_created ON tool_audits(session_id, created_at);
