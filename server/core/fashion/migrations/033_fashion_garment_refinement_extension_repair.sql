BEGIN;

-- Once refinement columns/rows exist, the historical F4 migration 030 cannot be
-- used as a repair script because its closed lineage shape predates the F5
-- branch. Repair the shared F4-owned objects and F5 extension atomically.
DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_texture_insert_guard ON canonical_image_artifacts;
DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_texture_immut_guard ON canonical_image_artifacts;
DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_texture_lineage_immutable_gua ON canonical_image_artifacts;
DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_refinement_insert_guard ON canonical_image_artifacts;
DROP TRIGGER IF EXISTS canonical_image_artifacts_fashion_refinement_immut_guard ON canonical_image_artifacts;

ALTER TABLE canonical_image_artifacts
  ADD COLUMN IF NOT EXISTS garment_warp_layer_id uuid,
  ADD COLUMN IF NOT EXISTS garment_warp_layer_sha256 character(64),
  ADD COLUMN IF NOT EXISTS producer_parameters jsonb,
  ADD COLUMN IF NOT EXISTS producer_parameters_sha256 character(64),
  ADD COLUMN IF NOT EXISTS refinement_profile text,
  ADD COLUMN IF NOT EXISTS refinement_contract_version text;

ALTER TABLE canonical_image_artifacts
  ALTER COLUMN garment_warp_layer_id TYPE uuid USING garment_warp_layer_id::uuid,
  ALTER COLUMN garment_warp_layer_id DROP NOT NULL,
  ALTER COLUMN garment_warp_layer_id DROP DEFAULT,
  ALTER COLUMN garment_warp_layer_sha256 TYPE character(64) USING garment_warp_layer_sha256::character(64),
  ALTER COLUMN garment_warp_layer_sha256 DROP NOT NULL,
  ALTER COLUMN garment_warp_layer_sha256 DROP DEFAULT,
  ALTER COLUMN producer_parameters TYPE jsonb USING producer_parameters::jsonb,
  ALTER COLUMN producer_parameters DROP NOT NULL,
  ALTER COLUMN producer_parameters DROP DEFAULT,
  ALTER COLUMN producer_parameters_sha256 TYPE character(64) USING producer_parameters_sha256::character(64),
  ALTER COLUMN producer_parameters_sha256 DROP NOT NULL,
  ALTER COLUMN producer_parameters_sha256 DROP DEFAULT,
  ALTER COLUMN refinement_profile TYPE text USING refinement_profile::text,
  ALTER COLUMN refinement_profile DROP NOT NULL,
  ALTER COLUMN refinement_profile DROP DEFAULT,
  ALTER COLUMN refinement_contract_version TYPE text USING refinement_contract_version::text,
  ALTER COLUMN refinement_contract_version DROP NOT NULL,
  ALTER COLUMN refinement_contract_version DROP DEFAULT;

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_garment_warp_layer_evidence_fkey;
ALTER TABLE canonical_fashion_garment_warp_layers
  DROP CONSTRAINT IF EXISTS canonical_fashion_garment_warp_layers_final_evidence_unique;
ALTER TABLE canonical_fashion_garment_warp_layers
  ADD CONSTRAINT canonical_fashion_garment_warp_layers_final_evidence_unique
  UNIQUE (layer_id, content_sha256);
ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_garment_warp_layer_evidence_fkey
  FOREIGN KEY (garment_warp_layer_id, garment_warp_layer_sha256)
  REFERENCES canonical_fashion_garment_warp_layers (layer_id, content_sha256)
  ON DELETE RESTRICT;

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_fashion_hashes_check;
ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_fashion_hashes_check CHECK (
    (garment_warp_layer_sha256 IS NULL OR garment_warp_layer_sha256 ~ '^[0-9a-f]{64}$')
    AND
    (producer_parameters_sha256 IS NULL OR producer_parameters_sha256 ~ '^[0-9a-f]{64}$')
  );

ALTER TABLE canonical_image_artifacts
  DROP CONSTRAINT IF EXISTS canonical_image_artifacts_fashion_parameters_check;
ALTER TABLE canonical_image_artifacts
  ADD CONSTRAINT canonical_image_artifacts_fashion_parameters_check CHECK (
    producer_parameters IS NULL
    OR CASE
      WHEN jsonb_typeof(producer_parameters) = 'object' THEN
        producer_parameters ?& ARRAY['schema','textureTransform','featherRadius','colorSpacePolicy']
        AND producer_parameters - ARRAY['schema','textureTransform','featherRadius','colorSpacePolicy'] = '{}'::jsonb
        AND producer_parameters->>'schema' = 'BERS_GARMENT_TEXTURE_COMPOSITE_Q16_V1'
        AND producer_parameters->>'colorSpacePolicy' = 'SRGB_GAMMA_ENCODED_RGBA8'
        AND CASE
          WHEN jsonb_typeof(producer_parameters->'featherRadius') = 'number'
            AND producer_parameters->>'featherRadius' ~ '^[0-9]+$'
          THEN (producer_parameters->>'featherRadius')::bigint BETWEEN 0 AND 64
          ELSE FALSE
        END
        AND CASE
          WHEN jsonb_typeof(producer_parameters->'textureTransform') = 'object' THEN
            (producer_parameters->'textureTransform') ?& ARRAY['scaleXQ16','scaleYQ16','offsetXQ16','offsetYQ16','wrapMode','alphaPolicy']
            AND (producer_parameters->'textureTransform') - ARRAY['scaleXQ16','scaleYQ16','offsetXQ16','offsetYQ16','wrapMode','alphaPolicy'] = '{}'::jsonb
            AND producer_parameters#>>'{textureTransform,wrapMode}' = 'CLAMP'
            AND producer_parameters#>>'{textureTransform,alphaPolicy}' = 'PRESERVE_BASE_ALPHA'
            AND CASE
              WHEN jsonb_typeof(producer_parameters#>'{textureTransform,scaleXQ16}') = 'number'
                AND producer_parameters#>>'{textureTransform,scaleXQ16}' ~ '^[0-9]+$'
              THEN (producer_parameters#>>'{textureTransform,scaleXQ16}')::bigint BETWEEN 4096 AND 1048576
              ELSE FALSE
            END
            AND CASE
              WHEN jsonb_typeof(producer_parameters#>'{textureTransform,scaleYQ16}') = 'number'
                AND producer_parameters#>>'{textureTransform,scaleYQ16}' ~ '^[0-9]+$'
              THEN (producer_parameters#>>'{textureTransform,scaleYQ16}')::bigint BETWEEN 4096 AND 1048576
              ELSE FALSE
            END
            AND CASE
              WHEN jsonb_typeof(producer_parameters#>'{textureTransform,offsetXQ16}') = 'number'
                AND producer_parameters#>>'{textureTransform,offsetXQ16}' ~ '^-?[0-9]+$'
              THEN (producer_parameters#>>'{textureTransform,offsetXQ16}')::bigint BETWEEN -1048576 AND 1048576
              ELSE FALSE
            END
            AND CASE
              WHEN jsonb_typeof(producer_parameters#>'{textureTransform,offsetYQ16}') = 'number'
                AND producer_parameters#>>'{textureTransform,offsetYQ16}' ~ '^-?[0-9]+$'
              THEN (producer_parameters#>>'{textureTransform,offsetYQ16}')::bigint BETWEEN -1048576 AND 1048576
              ELSE FALSE
            END
          ELSE FALSE
        END
      ELSE FALSE
    END
  );

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

DROP INDEX IF EXISTS canonical_image_artifacts_garment_warp_layer_idx;
CREATE INDEX canonical_image_artifacts_garment_warp_layer_idx
  ON canonical_image_artifacts (garment_warp_layer_id)
  WHERE garment_warp_layer_id IS NOT NULL;
DROP INDEX IF EXISTS canonical_image_artifacts_refinement_parent_idx;
CREATE INDEX canonical_image_artifacts_refinement_parent_idx
  ON canonical_image_artifacts (source_image_storage_id)
  WHERE producer_operation = 'GARMENT_APPEARANCE_REFINEMENT';

CREATE OR REPLACE FUNCTION canonical_assert_fashion_texture_final_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.producer_operation IS DISTINCT FROM 'GARMENT_TEXTURE_COMPOSITE' THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM canonical_projects p
  JOIN canonical_image_artifacts source_image
    ON source_image.storage_id = NEW.source_image_storage_id
   AND source_image.tenant_id = NEW.tenant_id
   AND source_image.user_id = NEW.user_id
   AND source_image.project_id = NEW.project_id
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
    AND p.current_image_storage_id = NEW.source_image_storage_id
    AND source_image.revoked_at IS NULL
    AND source_image.deleted_at IS NULL
    AND (
      (source_image.role = 'ORIGINAL' AND source_image.lifecycle = 'IMMUTABLE')
      OR
      (source_image.role = 'COMPOSITE' AND source_image.lifecycle = 'FINAL')
    )
    AND source_image.width = NEW.width
    AND source_image.height = NEW.height
    AND layer.project_image_storage_id = NEW.source_image_storage_id
    AND layer.width = NEW.width
    AND layer.height = NEW.height
  FOR SHARE OF p, source_image, layer;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fashion texture FINAL lineage is stale, cross-scope or not bound to the canonical Project source'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION canonical_fashion_texture_final_lineage_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.producer_operation = 'GARMENT_TEXTURE_COMPOSITE'
     OR NEW.producer_operation = 'GARMENT_TEXTURE_COMPOSITE'
     OR OLD.garment_warp_layer_id IS DISTINCT FROM NEW.garment_warp_layer_id
     OR OLD.garment_warp_layer_sha256 IS DISTINCT FROM NEW.garment_warp_layer_sha256
     OR OLD.producer_parameters IS DISTINCT FROM NEW.producer_parameters
     OR OLD.producer_parameters_sha256 IS DISTINCT FROM NEW.producer_parameters_sha256 THEN
    RAISE EXCEPTION 'canonical Fashion texture FINAL lineage is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;

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

CREATE TRIGGER canonical_image_artifacts_fashion_texture_insert_guard
  BEFORE INSERT ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_assert_fashion_texture_final_insert();
CREATE TRIGGER canonical_image_artifacts_fashion_texture_immut_guard
  BEFORE UPDATE OF producer_operation,source_image_storage_id,mask_storage_id,garment_warp_layer_id,garment_warp_layer_sha256,producer_parameters,producer_parameters_sha256
  ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_fashion_texture_final_lineage_immutable_guard();
CREATE TRIGGER canonical_image_artifacts_fashion_refinement_insert_guard
  BEFORE INSERT ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_assert_fashion_refinement_final_insert();
CREATE TRIGGER canonical_image_artifacts_fashion_refinement_immut_guard
  BEFORE UPDATE OF producer_operation,source_image_storage_id,mask_storage_id,garment_warp_layer_id,garment_warp_layer_sha256,refinement_profile,refinement_contract_version
  ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_fashion_refinement_final_lineage_immutable_guard();

COMMIT;
