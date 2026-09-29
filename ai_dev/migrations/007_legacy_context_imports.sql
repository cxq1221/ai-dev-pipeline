CREATE TABLE IF NOT EXISTS legacy_context_imports (
  conversation_id VARCHAR(100) PRIMARY KEY,
  imported_at BIGINT NOT NULL
);
