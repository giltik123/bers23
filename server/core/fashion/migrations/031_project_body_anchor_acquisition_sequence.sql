BEGIN;

ALTER TABLE canonical_project_body_anchor_sets
  ADD COLUMN acquisition_sequence bigint GENERATED ALWAYS AS IDENTITY;

ALTER TABLE canonical_project_body_anchor_sets
  ADD CONSTRAINT canonical_project_body_anchor_sets_acquisition_sequence_unique
  UNIQUE (acquisition_sequence);

DROP INDEX canonical_project_body_anchor_sets_owner_project_idx;

CREATE INDEX canonical_project_body_anchor_sets_owner_project_idx
  ON canonical_project_body_anchor_sets
  (tenant_id, user_id, project_id, project_image_storage_id, acquisition_sequence DESC, anchor_set_id);

COMMIT;
