CREATE TABLE IF NOT EXISTS requirement_clarifications (
 requirement_id VARCHAR(64) PRIMARY KEY,
 conversation_id VARCHAR(64) NOT NULL UNIQUE,
 mode VARCHAR(32) NOT NULL DEFAULT 'clarification',
 FOREIGN KEY (requirement_id) REFERENCES requirements(id),
 FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
