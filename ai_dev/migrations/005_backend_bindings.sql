CREATE TABLE IF NOT EXISTS llm_backends (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_backends (
  conversation_id VARCHAR(100) PRIMARY KEY,
  backend_id VARCHAR(100) NOT NULL
);
