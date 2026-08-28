BEGIN;

ALTER TABLE canonical_mask_artifacts
  DROP CONSTRAINT IF EXISTS canonical_mask_artifacts_lineage_shape_check;

ALTER TABLE canonical_mask_artifacts
  ADD CONSTRAINT canonical_mask_artifacts_lineage_shape_check CHECK (
    (producer_operation IS NULL AND source_image_storage_id IS NULL AND parent_mask_storage_id IS NULL)
    OR
    (producer_operation = 'MANUAL_SELECTION' AND source_image_storage_id IS NOT NULL AND parent_mask_storage_id IS NULL)
    OR
    (producer_operation = 'LOCAL_SEGMENTATION' AND source_image_storage_id IS NOT NULL AND parent_mask_storage_id IS NULL)
    OR
    (producer_operation = 'MASK_REFINEMENT' AND source_image_storage_id IS NOT NULL AND parent_mask_storage_id IS NOT NULL)
  );

COMMIT;
