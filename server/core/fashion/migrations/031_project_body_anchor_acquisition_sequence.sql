BEGIN;

ALTER TABLE canonical_project_body_anchor_sets
  ADD COLUMN acquisition_sequence bigint GENERATED ALWAYS AS IDENTITY;

ALTER TABLE canonical_project_body_anchor_sets
  ADD CONSTRAINT canonical_project_body_anchor_sets_acquisition_sequence_unique
  UNIQUE (acquisition_sequence);

-- Two-phase rollout: the current F4b.6a readiness reader still orders by
-- created_at until the follow-up acquisition-sequence consumer migration lands.
-- Keep the existing owner_project_idx intact so the intermediate production
-- state remains indexed, and add the future sequence lookup beside it.
CREATE INDEX canonical_project_body_anchor_sets_owner_project_sequence_idx
  ON canonical_project_body_anchor_sets
  (tenant_id, user_id, project_id, project_image_storage_id, acquisition_sequence DESC, anchor_set_id);

COMMIT;
