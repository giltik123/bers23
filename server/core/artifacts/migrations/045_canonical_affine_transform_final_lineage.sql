BEGIN;

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_lineage_shape_check;

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
      producer_operation = 'BACKGROUND_ISOLATION'
      AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NOT NULL
      AND garment_warp_layer_id IS NULL AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL AND producer_parameters_sha256 IS NULL
      AND refinement_parent_image_storage_id IS NULL AND refinement_parent_image_sha256 IS NULL
      AND refinement_profile IS NULL AND refinement_contract_version IS NULL
    )
    OR (
      producer_operation IN ('CROP','RESIZE','ORTHOGONAL_TRANSFORM','AFFINE_TRANSFORM')
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
  );

COMMIT;
