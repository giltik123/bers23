BEGIN;

-- Full-frame prompt-driven FAL results are canonical FINAL images, not
-- untrusted provider URLs. Bind each generated image to the current Project.
DO $migration$
DECLARE previous text;
DECLARE refinement_guard text := '';
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO previous
  FROM pg_constraint
  WHERE conrelid='canonical_image_artifacts'::regclass
    AND conname='canonical_image_artifacts_lineage_shape_check';
  IF previous IS NULL THEN
    RAISE EXCEPTION 'Existing FINAL image lineage constraint is required';
  END IF;
  -- Older production-test schemas predate Fashion refinement columns.
  -- Keep the extra NULL guards when those columns exist without demanding them
  -- from a historical schema that has not reached the refinement migration.
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='canonical_image_artifacts'
      AND column_name='refinement_parent_image_storage_id') THEN
    refinement_guard := ' AND refinement_parent_image_storage_id IS NULL
      AND refinement_parent_image_sha256 IS NULL
      AND refinement_profile IS NULL AND refinement_contract_version IS NULL';
  END IF;
  IF position('GLOBAL_EDIT' in previous)=0 THEN
    ALTER TABLE canonical_image_artifacts
      DROP CONSTRAINT canonical_image_artifacts_lineage_shape_check;
    EXECUTE 'ALTER TABLE canonical_image_artifacts ADD CONSTRAINT canonical_image_artifacts_lineage_shape_check CHECK ((' || previous || ') OR (
      producer_operation = ''GLOBAL_EDIT'' AND source_image_storage_id IS NOT NULL
      AND mask_storage_id IS NULL
      AND garment_warp_layer_id IS NULL AND garment_warp_layer_sha256 IS NULL
      AND producer_parameters IS NULL AND producer_parameters_sha256 IS NULL\n    ' || refinement_guard || '))';
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION canonical_assert_global_edit_source()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.producer_operation IS DISTINCT FROM 'GLOBAL_EDIT' THEN RETURN NEW; END IF;
  PERFORM 1 FROM canonical_projects p
    JOIN canonical_image_artifacts src ON src.storage_id=NEW.source_image_storage_id
    WHERE p.project_id::text=NEW.project_id
      AND p.tenant_id=NEW.tenant_id AND p.user_id=NEW.user_id
      AND p.deleted_at IS NULL AND p.current_image_storage_id=src.storage_id
      AND src.tenant_id=NEW.tenant_id AND src.user_id=NEW.user_id
      AND src.project_id=NEW.project_id AND src.revoked_at IS NULL
      AND src.deleted_at IS NULL
      AND ((src.role='ORIGINAL' AND src.lifecycle='IMMUTABLE')
        OR (src.role='COMPOSITE' AND src.lifecycle='FINAL'))
    FOR SHARE OF p,src;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Global edit source is stale or outside the project scope'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS canonical_image_artifacts_global_edit_source ON canonical_image_artifacts;
CREATE TRIGGER canonical_image_artifacts_global_edit_source
  BEFORE INSERT ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_assert_global_edit_source();

CREATE OR REPLACE FUNCTION canonical_global_edit_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.producer_operation='GLOBAL_EDIT' OR NEW.producer_operation='GLOBAL_EDIT' THEN
    RAISE EXCEPTION 'Global edit FINAL bytes and source lineage are immutable'
      USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS canonical_image_artifacts_global_edit_immutable ON canonical_image_artifacts;
CREATE TRIGGER canonical_image_artifacts_global_edit_immutable
  BEFORE UPDATE OF source_image_storage_id,producer_operation,width,height,image_bytes
  ON canonical_image_artifacts
  FOR EACH ROW EXECUTE FUNCTION canonical_global_edit_immutable_guard();

COMMIT;
