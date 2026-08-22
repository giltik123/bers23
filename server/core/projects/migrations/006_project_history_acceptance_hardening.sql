BEGIN;

ALTER TABLE canonical_project_history
  DROP CONSTRAINT canonical_project_history_kind_check;
ALTER TABLE canonical_project_history
  ADD CONSTRAINT canonical_project_history_kind_check
  CHECK (kind IN ('ORIGINAL','ACCEPTED_FINAL','RESTORE_VERSION'));

ALTER TABLE canonical_project_history
  DROP CONSTRAINT canonical_project_history_project_id_image_storage_id_key;
CREATE UNIQUE INDEX canonical_project_history_accepted_final_idx
  ON canonical_project_history(project_id,image_storage_id)
  WHERE kind='ACCEPTED_FINAL';

ALTER TABLE canonical_project_history
  ADD COLUMN execution_id text,
  ADD COLUMN operation_id text,
  ADD COLUMN credits_used integer NOT NULL DEFAULT 0 CHECK (credits_used >= 0);

ALTER TABLE canonical_project_versions
  ADD COLUMN history_id uuid REFERENCES canonical_project_history(history_id);

UPDATE canonical_project_versions v
SET history_id = h.history_id
FROM canonical_project_history h
WHERE h.project_id=v.project_id
  AND h.image_storage_id=v.image_storage_id
  AND h.retired_at IS NULL
  AND v.history_id IS NULL;

COMMIT;
