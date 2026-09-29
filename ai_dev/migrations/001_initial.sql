CREATE TABLE IF NOT EXISTS requirements (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  original_description TEXT NOT NULL,
  clarified_description TEXT NOT NULL,
  repository_path TEXT NOT NULL,
  base_ref VARCHAR(64) NOT NULL,
  branch_name VARCHAR(255) NOT NULL,
  workspace_path TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
