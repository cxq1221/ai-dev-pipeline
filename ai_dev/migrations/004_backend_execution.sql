CREATE TABLE IF NOT EXISTS backend_executions (
  run_id VARCHAR(100) PRIMARY KEY,
  conversation_id VARCHAR(100) NOT NULL,
  request JSON NOT NULL,
  event_cursor BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS business_tool_results (
  run_id VARCHAR(100) NOT NULL,
  tool_call_id VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  args JSON NOT NULL,
  result JSON NOT NULL,
  PRIMARY KEY (run_id,tool_call_id)
);
