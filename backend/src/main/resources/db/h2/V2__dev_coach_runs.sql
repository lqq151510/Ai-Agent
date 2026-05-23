CREATE TABLE IF NOT EXISTS dev_coach_runs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    run_type VARCHAR(64) NOT NULL,
    title VARCHAR(160) NOT NULL,
    input_text TEXT NOT NULL,
    output_json TEXT NOT NULL,
    artifact_path VARCHAR(600),
    created_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_dev_coach_runs_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS idx_dev_coach_runs_user_created ON dev_coach_runs(user_id, created_at DESC);
