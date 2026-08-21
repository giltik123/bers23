BEGIN;
CREATE TABLE canonical_mask_artifacts (
  storage_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id text NOT NULL,
  role text NOT NULL CHECK (role = 'MASK'),
  encoding text NOT NULL CHECK (encoding = 'ALPHA_8_LOSSLESS'),
  coordinate_space text NOT NULL CHECK (coordinate_space = 'ORIGINAL'),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  png_bytes bytea NOT NULL CHECK (octet_length(png_bytes) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamptz
);
CREATE INDEX canonical_mask_artifacts_scope_idx ON canonical_mask_artifacts (tenant_id, user_id, project_id, storage_id) WHERE revoked_at IS NULL;
COMMIT;
