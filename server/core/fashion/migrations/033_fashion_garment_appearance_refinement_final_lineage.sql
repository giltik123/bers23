BEGIN;

ALTER TABLE canonical_image_artifacts
  ADD COLUMN IF NOT EXISTS refinement_parent_storage_id uuid,
  ADD COLUMN IF NOT EXISTS refinement_parent_sha256 character(64),
  ADD COLUMN IF NOT EXISTS refinement_profile text,
  ADD COLUMN IF NOT EXISTS refinement_support_sha256 character(64);

ALTER TABLE canonical_image_artifacts
  ALTER COLUMN refinement_parent_storage_id TYPE uuid USING refinement_parent_storage_id::uuid,
  ALTER COLUMN refinement_parent_storage_id DROP NOT NULL,
  ALTER COLUMN refinement_parent_storage_id DROP DEFAULT,
  ALTER COLUMN refinement_parent_sha256 TYPE character(64) USING refinement_parent_sha256::character(64),
  ALTER COLUMN refinement_parent_sha256 DROP NOT NULL,
  ALTER COLUMN refinement_parent_sha256 DROP DEFAULT,
  ALTER COLUMN refinement_profile TYPE text USING refinement_profile::text,
  ALTER COLUMN refinement_profile DROP NOT NULL,
  ALTER COLUMN refinement_profile DROP DEFAULT,
  ALTER COLUMN refinement_support_sha256 TYPE character(64) USING refinement_support_sha256::character(64),
  ALTER COLUMN refinement_support_sha256 DROP NOT NULL,
  ALTER COLUMN refinement_support_sha256 DROP DEFAULT;

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_refinement_parent_fkey;
ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_refinement_parent_fkey
  FOREIGN KEY (refinement_parent_storage_id)
  REFERENCES canonical_image_artifacts (storage_id)
  ON DELETE RESTRICT;

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_refinement_hashes_check;
ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_refinement_hashes_check CHECK (
    (refinement_parent_sha256 IS NULL OR refinement_parent_sha256 ~ '^[0-9a-f]{64}$')
    AND
    (refinement_support_sha256 IS NULL OR refinement_support_sha256 ~ '^[0-9a-f]{64}$')
  );

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_refinement_profile_check;
ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_refinement_profile_check CHECK (
    refinement_profile IS NULL OR refinement_profile = 'REFINE_REALISM_V1'
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
      AND refinement_parent_storage_id IS NULL
      AND refinement_parent_sha256 IS NULL
      AND refinement_profile IS NULL
      AND refinement_support_sha256 IS NULL
    )
    OR (
      producer_operation = 'BACKGROUND_ISOLATION'
      AND source_image_storage_id IS NOT NULL
      AND mask_storage_id IS NOT NULL
      AND garment_warp_layer_id IS NULL
      AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL
      AND producer_parameters_sha256 IS NULL
      AND refinement_parent_storage_id IS NULL
      AND refinement_parent_sha256 IS NULL
      AND refinement_profile IS NULL
      AND refinement_support_sha256 IS NULL
    )
    OR (
      producer_operation IN ('CROP','RESIZE','ORTHOGONAL_TRANSFORM')
      AND source_image_storage_id IS NOT NULL
      AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NULL
      AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL
      AND producer_parameters_sha256 IS NULL
      AND refinement_parent_storage_id IS NULL
      AND refinement_parent_sha256 IS NULL
      AND refinement_profile IS NULL
      AND refinement_support_sha256 IS NULL
    )
    OR (
      producer_operation = 'GARMENT_TEXTURE_COMPOSITE'
      AND source_image_storage_id IS NOT NULL
      AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NOT NULL
      AND garment_warp_layer_sha256 IS NOT NULL
      AND producer_parameters IS NOT NULL
      AND producer_parameters_sha256 IS NOT NULL
      AND refinement_parent_storage_id IS NULL
      AND refinement_parent_sha256 IS NULL
      AND refinement_profile IS NULL
      AND refinement_support_sha256 IS NULL
    )
    OR (
      producer_operation = 'GARMENT_APPEARANCE_REFINEMENT'
      AND source_image_storage_id IS NULL
      AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NULL
      AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL
      AND producer_parameters_sha256 IS NULL
      AND refinement_parent_storage_id IS NOT NULL
      AND refinement_parent_sha256 IS NOT NULL
      AND refinement_profile = 'REFINE_REALISM_V1'
      AND refinement_support_sha256 IS NOT NULL
    )
  );

DROP INDEX IF EXISTS canonical_image_artifacts_refinement_parent_idx;
CREATE INDEX canonical_image_artifacts_refinement_parent_idx
  ON canonical_image_artifacts (refinement_parent_storage_id)
  WHERE refinement_parent_storage_id IS NOT NULL;

CREATE OR REPLACE FUNCTION canonical_assert_fashion_refinement_final_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.producer_operation IS DISTINCT FROM 'GARMENT_APPEARANCE_REFINEMENT' THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM canonical_image_artifacts parent
  JOIN canonical_image_artifacts source_image
    ON source_image.storage_id = parent.source_image_storage_id
   AND source_image.tenant_id = NEW.tenant_id
   AND source_image.user_id = NEW.user_id
   AND source_image.project_id = NEW.project_id
   AND source_image.revoked_at IS NULL
   AND source_image.deleted_at IS NULL
   AND (
     (source_image.role = 'ORIGINAL' AND source_image.lifecycle = 'IMMUTABLE')
     OR
     (source_image.role = 'COMPOSITE' AND source_image.lifecycle = 'FINAL')
   )
  JOIN canonical_fashion_garment_warp_layers layer
    ON layer.layer_id = parent.garment_warp_layer_id
   AND layer.content_sha256 = parent.garment_warp_layer_sha256
   AND layer.tenant_id = NEW.tenant_id
   AND layer.user_id = NEW.user_id
   AND layer.project_id::text = NEW.project_id
   AND layer.project_image_storage_id = parent.source_image_storage_id
  WHERE parent.storage_id = NEW.refinement_parent_storage_id
    AND parent.tenant_id = NEW.tenant_id
    AND parent.user_id = NEW.user_id
    AND parent.project_id = NEW.project_id
    AND parent.role = 'COMPOSITE'
    AND parent.lifecycle = 'FINAL'
    AND parent.revoked_at IS NULL
    AND parent.deleted_at IS NULL
    AND parent.producer_operation = 'GARMENT_TEXTURE_COMPOSITE'
    AND parent.source_image_storage_id IS NOT NULL
    AND parent.mask_storage_id IS NULL
    AND parent.garment_warp_layer_id IS NOT NULL
    AND parent.garment_warp_layer_sha256 IS NOT NULL
    AND parent.producer_parameters IS NOT NULL
    AND parent.producer_parameters_sha256 IS NOT NULL
    AND encode(sha256(parent.image_bytes), 'hex') = NEW.refinement_parent_sha256
    AND parent.width = NEW.width
    AND parent.height = NEW.height
    AND source_image.width = NEW.width
    AND source_image.height = NEW.height
    AND layer.width = NEW.width
    AND layer.height = NEW.height
  FOR SHARE OF parent, source_image, layer;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fashion refinement FINAL parent is unavailable, cross-scope, corrupt or not an exact deterministic Fashion FINAL'
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
     OR OLD.refinement_parent_storage_id IS DISTINCT FROM NEW.refinement_parent_storage_id
     OR OLD.refinement_parent_sha256 IS DISTINCT FROM NEW.refinement_parent_sha256
     OR OLD.refinement_profile IS DISTINCT FROM NEW.refinement_profile
     OR OLD.refinement_support_sha256 IS DISTINCT FROM NEW.refinement_support_sha256 THEN
    RAISE EXCEPTION 'canonical Fashion refinement FINAL lineage is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_refinement_insert_guard ON canonical_image_artifacts;
DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_refinement_immut_guard ON canonical_image_artifacts;

CREATE TRIGGER canonical_image_artifacts_fashion_refinement_insert_guard
  BEFORE INSERT ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_assert_fashion_refinement_final_insert();

CREATE TRIGGER canonical_image_artifacts_fashion_refinement_immut_guard
  BEFORE UPDATE OF producer_operation,refinement_parent_storage_id,refinement_parent_sha256,refinement_profile,refinement_support_sha256
  ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_fashion_refinement_final_lineage_immutable_guard();

COMMIT;
