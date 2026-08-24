BEGIN;

ALTER TABLE canonical_mask_artifacts
  ADD COLUMN IF NOT EXISTS source_image_storage_id uuid,
  ADD COLUMN IF NOT EXISTS parent_mask_storage_id uuid,
  ADD COLUMN IF NOT EXISTS producer_operation text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canonical_mask_artifacts_source_image_fk'
      AND conrelid = 'canonical_mask_artifacts'::regclass
  ) THEN
    ALTER TABLE canonical_mask_artifacts
      ADD CONSTRAINT canonical_mask_artifacts_source_image_fk
      FOREIGN KEY (source_image_storage_id)
      REFERENCES canonical_image_artifacts(storage_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canonical_mask_artifacts_parent_mask_fk'
      AND conrelid = 'canonical_mask_artifacts'::regclass
  ) THEN
    ALTER TABLE canonical_mask_artifacts
      ADD CONSTRAINT canonical_mask_artifacts_parent_mask_fk
      FOREIGN KEY (parent_mask_storage_id)
      REFERENCES canonical_mask_artifacts(storage_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canonical_mask_artifacts_lineage_shape_check'
      AND conrelid = 'canonical_mask_artifacts'::regclass
  ) THEN
    ALTER TABLE canonical_mask_artifacts
      ADD CONSTRAINT canonical_mask_artifacts_lineage_shape_check CHECK (
        (producer_operation IS NULL AND source_image_storage_id IS NULL AND parent_mask_storage_id IS NULL)
        OR
        (producer_operation = 'MANUAL_SELECTION' AND source_image_storage_id IS NOT NULL AND parent_mask_storage_id IS NULL)
        OR
        (producer_operation = 'MASK_REFINEMENT' AND source_image_storage_id IS NOT NULL AND parent_mask_storage_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS canonical_mask_artifacts_source_image_idx
  ON canonical_mask_artifacts (source_image_storage_id)
  WHERE source_image_storage_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS canonical_mask_artifacts_parent_mask_idx
  ON canonical_mask_artifacts (parent_mask_storage_id)
  WHERE parent_mask_storage_id IS NOT NULL AND revoked_at IS NULL;

COMMIT;
