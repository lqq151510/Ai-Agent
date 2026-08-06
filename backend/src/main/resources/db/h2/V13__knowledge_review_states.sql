CREATE TABLE IF NOT EXISTS knowledge_review_states (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    knowledge_item_id UUID NOT NULL,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    interval_days INTEGER NOT NULL,
    ease_factor DOUBLE PRECISION NOT NULL,
    repetitions INTEGER NOT NULL,
    last_rating VARCHAR(16),
    last_reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_knowledge_review_states_user
        FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_knowledge_review_states_item
        FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items (id),
    CONSTRAINT uq_knowledge_review_states_user_item UNIQUE (user_id, knowledge_item_id),
    CONSTRAINT ck_knowledge_review_states_interval_days CHECK (interval_days >= 1),
    CONSTRAINT ck_knowledge_review_states_ease_factor CHECK (ease_factor >= 1.3),
    CONSTRAINT ck_knowledge_review_states_repetitions CHECK (repetitions >= 0),
    CONSTRAINT ck_knowledge_review_states_last_rating
        CHECK (last_rating IS NULL OR last_rating IN ('again', 'hard', 'good', 'easy'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_review_states_user_due
    ON knowledge_review_states(user_id, due_at);
