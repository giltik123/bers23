BEGIN;
CREATE TABLE canonical_image_artifacts (
  storage_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id text NOT NULL,
  execution_id text NOT NULL,
  operation_id text NOT NULL,
  role text NOT NULL CHECK (role = 'COMPOSITE'),
  lifecycle text NOT NULL CHECK (lifecycle = 'FINAL'),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  encoding text NOT NULL CHECK (encoding = 'PNG_RGBA8_LOSSLESS'),
  content_type text NOT NULL CHECK (content_type = 'image/png'),
  image_bytes bytea NOT NULL CHECK (octet_length(image_bytes) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX canonical_image_artifacts_scope_idx ON canonical_image_artifacts
  (tenant_id, user_id, project_id, storage_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX canonical_image_artifacts_execution_final_idx ON canonical_image_artifacts
  (tenant_id, user_id, project_id, execution_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;
COMMIT;
