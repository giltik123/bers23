BEGIN;
ALTER TABLE canonical_image_artifacts DROP CONSTRAINT canonical_image_artifacts_role_check;
ALTER TABLE canonical_image_artifacts DROP CONSTRAINT canonical_image_artifacts_lifecycle_check;
ALTER TABLE canonical_image_artifacts ALTER COLUMN execution_id DROP NOT NULL;
ALTER TABLE canonical_image_artifacts ALTER COLUMN operation_id DROP NOT NULL;
ALTER TABLE canonical_image_artifacts ADD CONSTRAINT canonical_image_artifacts_role_check CHECK (role IN ('ORIGINAL','COMPOSITE'));
ALTER TABLE canonical_image_artifacts ADD CONSTRAINT canonical_image_artifacts_lifecycle_check CHECK ((role='ORIGINAL' AND lifecycle='IMMUTABLE') OR (role='COMPOSITE' AND lifecycle='FINAL'));
DROP INDEX canonical_image_artifacts_execution_final_idx;
CREATE UNIQUE INDEX canonical_image_artifacts_execution_final_idx ON canonical_image_artifacts
  (tenant_id,user_id,project_id,execution_id) WHERE role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL;

CREATE TABLE canonical_projects (
  project_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  original_image_storage_id uuid NOT NULL REFERENCES canonical_image_artifacts(storage_id),
  current_image_storage_id uuid NOT NULL REFERENCES canonical_image_artifacts(storage_id),
  width integer NOT NULL CHECK (width > 0), height integer NOT NULL CHECK (height > 0),
  status text NOT NULL DEFAULT 'draft', favorite boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false,
  objects jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(objects)='array'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at timestamptz
);
CREATE INDEX canonical_projects_scope_idx ON canonical_projects (tenant_id,user_id,project_id) WHERE deleted_at IS NULL;
CREATE INDEX canonical_projects_list_idx ON canonical_projects (tenant_id,user_id,updated_at DESC) WHERE deleted_at IS NULL;
COMMIT;
