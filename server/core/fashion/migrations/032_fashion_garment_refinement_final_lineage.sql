BEGIN;

DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_refinement_insert_guard ON canonical_image_artifacts;
DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_refinement_immut_guard ON canonical_image_artifacts;

ALTER TABLE canonical_image_artifacts
  ADD COLUMN IF NOT EXISTS refinement_parent_image_storage_id uuid,
  ADD COLUMN IF NOT EXISTS refinement_parent_image_sha256 character(64),
  ADD COLUMN IF NOT EXISTS refinement_profile text,
  ADD COLUMN IF NOT EXISTS refinement_contract_version text;

ALTER TABLE canonical_image_artifacts
  ALTER COLUMN refinement_parent_image_storage_id TYPE uuid USING refinement_parent_image_storage_id::uuid,
  ALTER COLUMN refinement_parent_image_storage_id DROP NOT NULL,
  ALTER COLUMN refinement_parent_image_storage_id DROP DEFAULT,
  ALTER COLUMN refinement_parent_image_sha256 TYPE character(64) USING refinement_parent_image_sha256::character(64),
  ALTER COLUMN refinement_parent_image_sha256 DROP NOT NULL,
  ALTER COLUMN refinement_parent_image_sha256 DROP DEFAULT,
  ALTER COLUMN refinement_profile TYPE text USING refinement_profile::text,
  ALTER COLUMN refinement_profile DROP NOT NULL,
  ALTER COLUMN refinement_profile DROP DEFAULT,
  ALTER COLUMN refinement_contract_version TYPE text USING refinement_contract_version::text,
  ALTER COLUMN refinement_contract_version DROP NOT NULL,
  ALTER COLUMN refinement_contract_version DROP DEFAULT;

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_refinement_parent_fkey;
ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_refinement_parent_fkey
  FOREIGN KEY (refinement_parent_image_storage_id)
  REFERENCES canonical_image_artifacts(storage_id)
  ON DELETE RESTRICT;

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_refinement_identity_check;
ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_refinement_identity_check CHECK (
    (refinement_parent_image_sha256 IS NULL OR refinement_parent_image_sha256 ~ '^[0-9a-f]{64}$')
    AND (refinement_profile IS NULL OR refinement_profile = 'REFINE_REALISM_V1')
    AND (refinement_contract_version IS NULL OR refinement_contract_version = '1')
  );

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
  );

DROP INDEX IF EXISTS canonical_image_artifacts_refinement_parent_idx;
CREATE INDEX canonical_image_artifacts_refinement_parent_idx
  ON canonical_image_artifacts (refinement_parent_image_storage_id)
  WHERE producer_operation = 'GARMENT_APPEARANCE_REFINEMENT';

CREATE OR REPLACE FUNCTION canonical_assert_fashion_refinement_final_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.producer_operation IS DISTINCT FROM 'GARMENT_APPEARANCE_REFINEMENT' THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM canonical_projects p
  JOIN canonical_image_artifacts project_source
    ON project_source.storage_id = NEW.source_image_storage_id
   AND project_source.tenant_id = NEW.tenant_id
   AND project_source.user_id = NEW.user_id
   AND project_source.project_id = NEW.project_id
  JOIN canonical_image_artifacts parent_image
    ON parent_image.storage_id = NEW.refinement_parent_image_storage_id
   AND parent_image.tenant_id = NEW.tenant_id
   AND parent_image.user_id = NEW.user_id
   AND parent_image.project_id = NEW.project_id
  WHERE p.project_id::text = NEW.project_id
    AND p.tenant_id = NEW.tenant_id
    AND p.user_id = NEW.user_id
    AND p.deleted_at IS NULL
    AND p.current_image_storage_id = NEW.source_image_storage_id
    AND project_source.revoked_at IS NULL
    AND project_source.deleted_at IS NULL
    AND ((project_source.role = 'ORIGINAL' AND project_source.lifecycle = 'IMMUTABLE')
      OR (project_source.role = 'COMPOSITE' AND project_source.lifecycle = 'FINAL'))
    AND parent_image.role = 'COMPOSITE'
    AND parent_image.lifecycle = 'FINAL'
    AND parent_image.producer_operation = 'GARMENT_TEXTURE_COMPOSITE'
    AND parent_image.revoked_at IS NULL
    AND parent_image.deleted_at IS NULL
    AND parent_image.source_image_storage_id = NEW.source_image_storage_id
    AND parent_image.width = NEW.width
    AND parent_image.height = NEW.height
    AND project_source.width = NEW.width
    AND project_source.height = NEW.height
    AND encode(sha256(parent_image.image_bytes), 'hex') = NEW.refinement_parent_image_sha256
  FOR SHARE OF p, project_source, parent_image;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fashion refinement FINAL lineage is stale, cross-scope or not bound to the exact deterministic F4 parent/current Project source'
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
     OR OLD.source_image_storage_id IS DISTINCT FROM NEW.source_image_storage_id
     OR OLD.refinement_parent_image_storage_id IS DISTINCT FROM NEW.refinement_parent_image_storage_id
     OR OLD.refinement_parent_image_sha256 IS DISTINCT FROM NEW.refinement_parent_image_sha256
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
  BEFORE UPDATE OF producer_operation,source_image_storage_id,refinement_parent_image_storage_id,refinement_parent_image_sha256,refinement_profile,refinement_contract_version
  ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_fashion_refinement_final_lineage_immutable_guard();

COMMIT;
