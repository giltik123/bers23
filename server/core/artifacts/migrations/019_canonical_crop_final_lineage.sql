BEGIN;

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_lineage_shape_check;

ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_lineage_shape_check CHECK (
    (producer_operation IS NULL AND source_image_storage_id IS NULL AND mask_storage_id IS NULL)
    OR
    (producer_operation = 'BACKGROUND_ISOLATION' AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NOT NULL)
    OR
    (producer_operation = 'CROP' AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NULL)
  );

COMMIT;
