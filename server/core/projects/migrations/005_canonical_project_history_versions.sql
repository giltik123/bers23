BEGIN;
CREATE TABLE canonical_project_history (
  history_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES canonical_projects(project_id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  image_storage_id uuid NOT NULL REFERENCES canonical_image_artifacts(storage_id),
  kind text NOT NULL CHECK (kind IN ('ORIGINAL','ACCEPTED_FINAL')),
  instruction text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retired_at timestamptz,
  UNIQUE (project_id, image_storage_id)
);
CREATE UNIQUE INDEX canonical_project_history_active_ordinal_idx
  ON canonical_project_history(project_id,ordinal) WHERE retired_at IS NULL;
CREATE INDEX canonical_project_history_scope_idx
  ON canonical_project_history(tenant_id,user_id,project_id,ordinal) WHERE retired_at IS NULL;

ALTER TABLE canonical_projects ADD COLUMN history_cursor_id uuid REFERENCES canonical_project_history(history_id);

CREATE TABLE canonical_project_versions (
  version_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES canonical_projects(project_id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  image_storage_id uuid NOT NULL REFERENCES canonical_image_artifacts(storage_id),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamptz
);
CREATE INDEX canonical_project_versions_scope_idx
  ON canonical_project_versions(tenant_id,user_id,project_id,created_at) WHERE deleted_at IS NULL;

INSERT INTO canonical_project_history(history_id,project_id,tenant_id,user_id,ordinal,image_storage_id,kind)
SELECT gen_random_uuid(),project_id,tenant_id,user_id,0,original_image_storage_id,'ORIGINAL'
FROM canonical_projects;
UPDATE canonical_projects p SET history_cursor_id=h.history_id
FROM canonical_project_history h WHERE h.project_id=p.project_id AND h.ordinal=0;
COMMIT;
