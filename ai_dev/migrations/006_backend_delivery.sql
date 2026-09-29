CREATE TABLE IF NOT EXISTS backend_delivery (
  run_id VARCHAR(100) PRIMARY KEY,
  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT IGNORE INTO backend_delivery (run_id,accepted) SELECT run_id,(event_cursor>0) FROM backend_executions;
