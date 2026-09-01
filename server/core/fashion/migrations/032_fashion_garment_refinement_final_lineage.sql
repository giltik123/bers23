BEGIN;

DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_refinement_insert_guard ON canonical_image_artifacts;
DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_refinement_immut_guard ON canonical_image_artifacts;

ALTER TABLE canonical_image_artifacts
  ADD COLUMN IF NOT EXISTS refinement_profile text,
  ADD COLUMN IF NOT EXISTS refinement_contract_version text;

ALTER TABLE canonical_image_artifacts
  ALTER COLUMN refinement_profile TYPE text USING refinement_profile::text,
  ALTER COLUMN refinement_profile DROP NOT NULL,
  ALTER COLUMN refinement_profile DROP DEFAULT,
  ALTER COLUMN refinement_contract_version TYPE text USING refinement_contract_version::text,
  ALTER COLUMN refinement_contract_version DROP NOT NULL,
  ALTER COLUMN refinement_contract_version DROP DEFAULT;

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_refinement_identity_check;
ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_refinement_identity_check CHECK (
    (refinement_profile IS NULL OR refinement_profile = 'REFINE_REALISM_V1')
    AND
    (refinement_contract_version IS NULL OR refinement_contract_version = '1')
  );

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_lineage_shape_check;
ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_lineage_shape_check CHECK (
    (
      producer_operation IS NULL
      AND source_image_storage_id IS NULL
      AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NULL
      AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL
      AND producer_parameters_sha256 IS NULL
      AND refinement_profile IS NULL
      AND refinement_contract_version IS NULL
    )
    OR (
      producer_operation = 'BACKGROUND_ISOLATION'
      AND source_image_storage_id IS NOT NULL
      AND mask_storage_id IS NOT NULL
      AND garment_warp_layer_id IS NULL
      AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL
      AND producer_parameters_sha256 IS NULL
      AND refinement_profile IS NULL
      AND refinement_contract_version IS NULL
    )
    OR (
      producer_operation = 'CROP'
      AND source_image_storage_id IS NOT NULL
      AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NULL
      AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL
      AND producer_parameters_sha256 IS NULL
      AND refinement_profile IS NULL
      AND refinement_contract_version IS NULL
    )
    OR (
      producer_operation = 'RESIZE'
      AND source_image_storage_id IS NOT NULL
      AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NULL
      AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL
      AND producer_parameters_sha256 IS NULL
      AND refinement_profile IS NULL
      AND refinement_contract_version IS NULL
    )
    OR (
      producer_operation = 'ORTHOGONAL_TRANSFORM'
      AND source_image_storage_id IS NOT NULL
      AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NULL
      AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL
      AND producer_parameters_sha256 IS NULL
      AND refinement_profile IS NULL
      AND refinement_contract_version IS NULL
    )
    OR (
      producer_operation = 'GARMENT_TEXTURE_COMPOSITE'
      AND source_image_storage_id IS NOT NULL
      AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NOT NULL
      AND garment_warp_layer_sha256 IS NOT NULL
      AND producer_parameters IS NOT NULL
      AND producer_parameters_sha256 IS NOT NULL
      AND refinement_profile IS NULL
      AND refinement_contract_version IS NULL
    )
    OR (
      producer_operation = 'GARMENT_APPEARANCE_REFINEMENT'
      AND source_image_storage_id IS NOT NULL
      AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NOT NULL
      AND garment_warp_layer_sha256 IS NOT NULL
      AND producer_parameters IS NULL
      AND producer_parameters_sha256 IS NULL
      AND refinement_profile = 'REFINE_REALISM_V1'
      AND refinement_contract_version = '1'
    )
  );

DROP INDEX IF EXISTS canonical_image_artifacts_refinement_parent_idx;
CREATE INDEX canonical_image_artifacts_refinement_parent_idx
  ON canonical_image_artifacts (source_image_storage_id)
  WHERE producer_operation = 'GARMENT_APPEARANCE_REFINEMENT';

CREATE OR REPLACE FUNCTION canonical_assert_fashion_refinement_final_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.producer_operation IS DISTINCT FROM 'GARMENT_APPEARANCE_REFINEMENT' THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM canonical_projects p
  JOIN canonical_image_artifacts parent_image
    ON parent_image.storage_id = NEW.source_image_storage_id
   AND parent_image.tenant_id = NEW.tenant_id
   AND parent_image.user_id = NEW.user_id
   AND parent_image.project_id = NEW.project_id
  JOIN canonical_image_artifacts project_source
    ON project_source.storage_id = parent_image.source_image_storage_id
   AND project_source.tenant_id = NEW.tenant_id
   AND project_source.user_id = NEW.user_id
   AND project_source.project_id = NEW.project_id
  JOIN canonical_fashion_garment_warp_layers layer
    ON layer.layer_id = NEW.garment_warp_layer_id
   AND layer.content_sha256 = NEW.garment_warp_layer_sha256
   AND layer.tenant_id = NEW.tenant_id
   AND layer.user_id = NEW.user_id
   AND layer.project_id::text = NEW.project_id
  WHERE p.project_id::text = NEW.project_id
    AND p.tenant_id = NEW.tenant_id
    AND p.user_id = NEW.user_id
    AND p.deleted_at IS NULL
    AND p.current_image_storage_id = parent_image.source_image_storage_id
    AND parent_image.role = 'COMPOSITE'
    AND parent_image.lifecycle = 'FINAL'
    AND parent_image.producer_operation = 'GARMENT_TEXTURE_COMPOSITE'
    AND parent_image.revoked_at IS NULL
    AND parent_image.deleted_at IS NULL
    AND parent_image.width = NEW.width
    AND parent_image.height = NEW.height
    AND parent_image.garment_warp_layer_id = NEW.garment_warp_layer_id
    AND parent_image.garment_warp_layer_sha256 = NEW.garment_warp_layer_sha256
    AND project_source.revoked_at IS NULL
    AND project_source.deleted_at IS NULL
    AND (
      (project_source.role = 'ORIGINAL' AND project_source.lifecycle = 'IMMUTABLE')
      OR
      (project_source.role = 'COMPOSITE' AND project_source.lifecycle = 'FINAL')
    )
    AND project_source.width = NEW.width
    AND project_source.height = NEW.height
    AND layer.project_image_storage_id = parent_image.source_image_storage_id
    AND layer.width = NEW.width
    AND layer.height = NEW.height
  FOR SHARE OF p, parent_image, project_source, layer;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fashion refinement FINAL lineage is stale, cross-scope or not bound to the deterministic F4 parent/current Project source'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION canonical_fashion_refinement_final_lineage_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.producer_operation = 'GARMENT_APPEARANCE_REFINEMENT'
     OR NEW.producer_operation = 'GARMENT_APPEARANCE_REFINEMENT'
     OR OLD.refinement_profile IS DISTINCT FROM NEW.refinement_profile
     OR OLD.refinement_contract_version IS DISTINCT FROM NEW.refinement_contract_version THEN
    RAISE EXCEPTION 'canonical Fashion refinement FINAL lineage is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER canonical_image_artifacts_fashion_refinement_insert_guard
  BEFORE INSERT ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_assert_fashion_refinement_final_insert();

CREATE TRIGGER canonical_image_artifacts_fashion_refinement_immut_guard
  BEFORE UPDATE OF producer_operation,source_image_storage_id,mask_storage_id,garment_warp_layer_id,garment_warp_layer_sha256,refinement_profile,refinement_contract_version
  ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_fashion_refinement_final_lineage_immutable_guard();

COMMIT;
