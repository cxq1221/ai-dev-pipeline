CREATE TABLE IF NOT EXISTS llm_sessions (
  id VARCHAR(100) PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  messages JSON NOT NULL
);
CREATE TABLE IF NOT EXISTS llm_runs (
  id VARCHAR(100) PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  request JSON NOT NULL,
  status VARCHAR(24) NOT NULL,
  events JSON NOT NULL,
  INDEX llm_runs_session_status (session_id,status)
);
CREATE TABLE IF NOT EXISTS llm_session_execution (
  session_id VARCHAR(100) PRIMARY KEY,
  state VARCHAR(24) NOT NULL,
  request JSON NOT NULL,
  current JSON NOT NULL,
  calls JSON NOT NULL
);
