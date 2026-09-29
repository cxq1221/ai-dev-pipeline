CREATE TABLE IF NOT EXISTS conversations (
 id VARCHAR(64) PRIMARY KEY, requirement_id VARCHAR(64) NOT NULL, title VARCHAR(255) NOT NULL,
 model VARCHAR(64) NOT NULL, context_messages JSON NOT NULL, checkpoint_turn_id VARCHAR(64),
 created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
 FOREIGN KEY (requirement_id) REFERENCES requirements(id)
);
CREATE TABLE IF NOT EXISTS turns (
 id VARCHAR(64) PRIMARY KEY, conversation_id VARCHAR(64) NOT NULL,
 prompt TEXT NOT NULL, blocks JSON NOT NULL, status VARCHAR(32) NOT NULL, error TEXT,
 source_ref JSON, started_at BIGINT NOT NULL, finished_at BIGINT,
 FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
