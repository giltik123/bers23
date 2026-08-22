BEGIN;

ALTER TABLE canonical_projects
  ADD COLUMN history_cursor integer NOT NULL DEFAULT -1;

CREATE TABLE canonical_project_history_entries (
  entry_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES canonical_projects(project_id),
  sequence integer NOT NULL CHECK (sequence >= -1),
  source_image_storage_id uuid NOT NULL REFERENCES canonical_image_artifacts(storage_id),
  result_image_storage_id uuid NOT NULL REFERENCES canonical_image_artifacts(storage_id),
  execution_id text,
  operation_id text,
  instruction text NOT NULL DEFAULT '',
  operation text NOT NULL,
  credits_used integer NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retired_at timestamptz
);

CREATE UNIQUE INDEX canonical_project_history_active_sequence_idx
  ON canonical_project_history_entries (tenant_id,user_id,project_id,sequence)
  WHERE retired_at IS NULL;
CREATE UNIQUE INDEX canonical_project_history_execution_idx
  ON canonical_project_history_entries (tenant_id,user_id,project_id,execution_id)
  WHERE execution_id IS NOT NULL;
CREATE INDEX canonical_project_history_scope_idx
  ON canonical_project_history_entries (tenant_id,user_id,project_id,sequence)
  WHERE retired_at IS NULL;

INSERT INTO canonical_project_history_entries
  (entry_id,tenant_id,user_id,project_id,sequence,source_image_storage_id,result_image_storage_id,instruction,operation)
SELECT project_id,tenant_id,user_id,project_id,-1,original_image_storage_id,original_image_storage_id,'','original'
FROM canonical_projects
ON CONFLICT (entry_id) DO NOTHING;

CREATE TABLE canonical_project_versions (
  version_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES canonical_projects(project_id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  image_storage_id uuid NOT NULL REFERENCES canonical_image_artifacts(storage_id),
  history_sequence integer NOT NULL CHECK (history_sequence >= -1),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamptz
);

CREATE INDEX canonical_project_versions_scope_idx
  ON canonical_project_versions (tenant_id,user_id,project_id,created_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;
