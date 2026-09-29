CREATE TABLE IF NOT EXISTS session_delivery (
  turn_id VARCHAR(100) PRIMARY KEY,
  attempted BOOLEAN NOT NULL DEFAULT FALSE,
  previous_id VARCHAR(100) NULL,
  backend_turn_id VARCHAR(100) NULL
);
-- Old pending deliveries cannot safely be resent under the session protocol.
INSERT IGNORE INTO session_delivery (turn_id,attempted,backend_turn_id)
SELECT e.run_id,TRUE,e.run_id FROM backend_executions e;
