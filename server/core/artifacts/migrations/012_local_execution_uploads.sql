CREATE TABLE IF NOT EXISTS local_execution_uploads (
  upload_id text PRIMARY KEY,
  ticket_id text NOT NULL,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id text NOT NULL,
  kind text NOT NULL,
  artifact_role text NOT NULL,
  mime_type text NOT NULL,
  width integer,
  height integer,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 char(64) NOT NULL,
  payload bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (width IS NULL OR width > 0),
  CHECK (height IS NULL OR height > 0),
  CHECK (octet_length(payload) = size_bytes),
  CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS local_execution_uploads_ticket_output_unique
  ON local_execution_uploads (ticket_id, kind, artifact_role);

CREATE INDEX IF NOT EXISTS local_execution_uploads_ticket_scope_idx
  ON local_execution_uploads (ticket_id, tenant_id, user_id, project_id);

CREATE INDEX IF NOT EXISTS local_execution_uploads_expiry_idx
  ON local_execution_uploads (expires_at)
  WHERE consumed_at IS NULL;
