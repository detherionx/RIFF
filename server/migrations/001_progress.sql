CREATE TABLE IF NOT EXISTS riff_accounts (
    token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
    progress jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (progress IS NULL OR jsonb_typeof(progress) = 'object')
);
