BEGIN;

ALTER TABLE canonical_image_artifacts
  ADD COLUMN IF NOT EXISTS source_image_storage_id uuid,
  ADD COLUMN IF NOT EXISTS mask_storage_id uuid,
  ADD COLUMN IF NOT EXISTS producer_operation text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canonical_image_artifacts_source_image_fk'
      AND conrelid = 'canonical_image_artifacts'::regclass
  ) THEN
    ALTER TABLE canonical_image_artifacts
      ADD CONSTRAINT canonical_image_artifacts_source_image_fk
      FOREIGN KEY (source_image_storage_id)
      REFERENCES canonical_image_artifacts(storage_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canonical_image_artifacts_mask_fk'
      AND conrelid = 'canonical_image_artifacts'::regclass
  ) THEN
    ALTER TABLE canonical_image_artifacts
      ADD CONSTRAINT canonical_image_artifacts_mask_fk
      FOREIGN KEY (mask_storage_id)
      REFERENCES canonical_mask_artifacts(storage_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canonical_image_artifacts_lineage_shape_check'
      AND conrelid = 'canonical_image_artifacts'::regclass
  ) THEN
    ALTER TABLE canonical_image_artifacts
      ADD CONSTRAINT canonical_image_artifacts_lineage_shape_check CHECK (
        (producer_operation IS NULL AND source_image_storage_id IS NULL AND mask_storage_id IS NULL)
        OR
        (producer_operation = 'BACKGROUND_ISOLATION' AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS canonical_image_artifacts_source_image_idx
  ON canonical_image_artifacts (source_image_storage_id)
  WHERE source_image_storage_id IS NOT NULL AND revoked_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS canonical_image_artifacts_mask_idx
  ON canonical_image_artifacts (mask_storage_id)
  WHERE mask_storage_id IS NOT NULL AND revoked_at IS NULL AND deleted_at IS NULL;

COMMIT;
