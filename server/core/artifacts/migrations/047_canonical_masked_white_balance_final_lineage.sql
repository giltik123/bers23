BEGIN;

-- Masked White Balance is a generic IMAGE+MASK producer, but this migration can be
-- exercised both before and after optional Fashion lineage extensions in tests.
-- Rebuild the one canonical shape constraint against the schema actually present
-- while preserving every previously admitted producer/field family.
ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_lineage_shape_check;

DO $migration$
DECLARE
  has_texture_fields boolean;
  has_refinement_fields boolean;
BEGIN
  SELECT count(*) = 4 INTO has_texture_fields
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'canonical_image_artifacts'
    AND column_name IN ('garment_warp_layer_id','garment_warp_layer_sha256','producer_parameters','producer_parameters_sha256');

  SELECT count(*) = 4 INTO has_refinement_fields
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'canonical_image_artifacts'
    AND column_name IN ('refinement_parent_image_storage_id','refinement_parent_image_sha256','refinement_profile','refinement_contract_version');

  IF has_refinement_fields THEN
    IF NOT has_texture_fields THEN
      RAISE EXCEPTION 'Masked White Balance migration found refinement lineage without texture lineage'
        USING ERRCODE='55000';
    END IF;
    EXECUTE $sql$
      ALTER TABLE canonical_image_artifacts
      ADD CONSTRAINT canonical_image_artifacts_lineage_shape_check CHECK (
        (
          producer_operation IS NULL
          AND source_image_storage_id IS NULL AND mask_storage_id IS NULL
          AND garment_warp_layer_id IS NULL AND garment_warp_layer_sha256 IS NULL
          AND producer_parameters IS NULL AND producer_parameters_sha256 IS NULL
          AND refinement_parent_image_storage_id IS NULL AND refinement_parent_image_sha256 IS NULL
          AND refinement_profile IS NULL AND refinement_contract_version IS NULL
        )
        OR (
          producer_operation IN ('BACKGROUND_ISOLATION','MASKED_EXPOSURE','MASKED_WHITE_BALANCE')
          AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NOT NULL
          AND garment_warp_layer_id IS NULL AND garment_warp_layer_sha256 IS NULL
          AND producer_parameters IS NULL AND producer_parameters_sha256 IS NULL
          AND refinement_parent_image_storage_id IS NULL AND refinement_parent_image_sha256 IS NULL
          AND refinement_profile IS NULL AND refinement_contract_version IS NULL
        )
        OR (
          producer_operation IN ('CROP','RESIZE','ORTHOGONAL_TRANSFORM')
          AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NULL
          AND garment_warp_layer_id IS NULL AND garment_warp_layer_sha256 IS NULL
          AND producer_parameters IS NULL AND producer_parameters_sha256 IS NULL
          AND refinement_parent_image_storage_id IS NULL AND refinement_parent_image_sha256 IS NULL
          AND refinement_profile IS NULL AND refinement_contract_version IS NULL
        )
        OR (
          producer_operation = 'GARMENT_TEXTURE_COMPOSITE'
          AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NULL
          AND garment_warp_layer_id IS NOT NULL AND garment_warp_layer_sha256 IS NOT NULL
          AND producer_parameters IS NOT NULL AND producer_parameters_sha256 IS NOT NULL
          AND refinement_parent_image_storage_id IS NULL AND refinement_parent_image_sha256 IS NULL
          AND refinement_profile IS NULL AND refinement_contract_version IS NULL
        )
        OR (
          producer_operation = 'GARMENT_APPEARANCE_REFINEMENT'
          AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NULL
          AND garment_warp_layer_id IS NULL AND garment_warp_layer_sha256 IS NULL
          AND producer_parameters IS NULL AND producer_parameters_sha256 IS NULL
          AND refinement_parent_image_storage_id IS NOT NULL AND refinement_parent_image_sha256 IS NOT NULL
          AND refinement_profile = 'REFINE_REALISM_V1' AND refinement_contract_version = '1'
        )
      )
    $sql$;
  ELSIF has_texture_fields THEN
    EXECUTE $sql$
      ALTER TABLE canonical_image_artifacts
      ADD CONSTRAINT canonical_image_artifacts_lineage_shape_check CHECK (
        (
          producer_operation IS NULL
          AND source_image_storage_id IS NULL AND mask_storage_id IS NULL
          AND garment_warp_layer_id IS NULL AND garment_warp_layer_sha256 IS NULL
          AND producer_parameters IS NULL AND producer_parameters_sha256 IS NULL
        )
        OR (
          producer_operation IN ('BACKGROUND_ISOLATION','MASKED_EXPOSURE','MASKED_WHITE_BALANCE')
          AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NOT NULL
          AND garment_warp_layer_id IS NULL AND garment_warp_layer_sha256 IS NULL
          AND producer_parameters IS NULL AND producer_parameters_sha256 IS NULL
        )
        OR (
          producer_operation IN ('CROP','RESIZE','ORTHOGONAL_TRANSFORM')
          AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NULL
          AND garment_warp_layer_id IS NULL AND garment_warp_layer_sha256 IS NULL
          AND producer_parameters IS NULL AND producer_parameters_sha256 IS NULL
        )
        OR (
          producer_operation = 'GARMENT_TEXTURE_COMPOSITE'
          AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NULL
          AND garment_warp_layer_id IS NOT NULL AND garment_warp_layer_sha256 IS NOT NULL
          AND producer_parameters IS NOT NULL AND producer_parameters_sha256 IS NOT NULL
        )
      )
    $sql$;
  ELSE
    EXECUTE $sql$
      ALTER TABLE canonical_image_artifacts
      ADD CONSTRAINT canonical_image_artifacts_lineage_shape_check CHECK (
        (producer_operation IS NULL AND source_image_storage_id IS NULL AND mask_storage_id IS NULL)
        OR
        (producer_operation IN ('BACKGROUND_ISOLATION','MASKED_EXPOSURE','MASKED_WHITE_BALANCE') AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NOT NULL)
        OR
        (producer_operation = 'CROP' AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NULL)
        OR
        (producer_operation = 'RESIZE' AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NULL)
        OR
        (producer_operation = 'ORTHOGONAL_TRANSFORM' AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NULL)
      )
    $sql$;
  END IF;
END
$migration$;

COMMIT;
