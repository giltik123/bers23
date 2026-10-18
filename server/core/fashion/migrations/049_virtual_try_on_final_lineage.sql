BEGIN;
DO $$
DECLARE previous text; refinement_close text := '';
  has_refinement boolean;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous FROM pg_constraint
    WHERE conrelid='canonical_image_artifacts'::regclass AND conname='canonical_image_artifacts_lineage_shape_check';
  IF previous IS NULL THEN RAISE EXCEPTION 'Existing FINAL lineage policy is required'; END IF;
  SELECT count(*)=4 INTO has_refinement FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='canonical_image_artifacts'
      AND column_name IN ('refinement_parent_image_storage_id','refinement_parent_image_sha256','refinement_profile','refinement_contract_version');
  IF has_refinement THEN
    refinement_close := ' AND refinement_parent_image_storage_id IS NULL AND refinement_parent_image_sha256 IS NULL AND refinement_profile IS NULL AND refinement_contract_version IS NULL';
  END IF;
  IF position('VIRTUAL_TRY_ON' in previous)=0 THEN
    ALTER TABLE canonical_image_artifacts DROP CONSTRAINT canonical_image_artifacts_lineage_shape_check;
    EXECUTE 'ALTER TABLE canonical_image_artifacts ADD CONSTRAINT canonical_image_artifacts_lineage_shape_check CHECK ((' || previous || ') OR (
      producer_operation = ''VIRTUAL_TRY_ON'' AND source_image_storage_id IS NOT NULL AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NULL AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL AND producer_parameters_sha256 IS NULL' || refinement_close || '))';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION canonical_assert_virtual_try_on_source()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.producer_operation IS DISTINCT FROM 'VIRTUAL_TRY_ON' THEN RETURN NEW; END IF;
  PERFORM 1 FROM canonical_projects p JOIN canonical_image_artifacts s ON s.storage_id=NEW.source_image_storage_id
    WHERE p.project_id::text=NEW.project_id AND p.tenant_id=NEW.tenant_id AND p.user_id=NEW.user_id
      AND p.deleted_at IS NULL AND p.current_image_storage_id=s.storage_id
      AND s.tenant_id=NEW.tenant_id AND s.user_id=NEW.user_id AND s.project_id=NEW.project_id
      AND s.deleted_at IS NULL AND s.revoked_at IS NULL AND s.width=NEW.width AND s.height=NEW.height
      AND ((s.role='ORIGINAL' AND s.lifecycle='IMMUTABLE') OR (s.role='COMPOSITE' AND s.lifecycle='FINAL'))
    FOR SHARE OF p,s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Virtual Try-On source is stale or outside the Project scope' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_image_artifacts_virtual_try_on_source ON canonical_image_artifacts;
CREATE TRIGGER canonical_image_artifacts_virtual_try_on_source BEFORE INSERT ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_assert_virtual_try_on_source();
CREATE OR REPLACE FUNCTION canonical_virtual_try_on_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.producer_operation='VIRTUAL_TRY_ON' OR NEW.producer_operation='VIRTUAL_TRY_ON' THEN
    RAISE EXCEPTION 'Virtual Try-On FINAL bytes and source lineage are immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_image_artifacts_virtual_try_on_immutable ON canonical_image_artifacts;
CREATE TRIGGER canonical_image_artifacts_virtual_try_on_immutable
  BEFORE UPDATE OF source_image_storage_id,producer_operation,width,height,image_bytes ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_virtual_try_on_immutable_guard();
COMMIT;
