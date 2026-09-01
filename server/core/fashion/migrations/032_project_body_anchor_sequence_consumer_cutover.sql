BEGIN;

DO $$
DECLARE
  sequence_index_definition text;
BEGIN
  SELECT indexdef
    INTO sequence_index_definition
    FROM pg_indexes
   WHERE schemaname = current_schema()
     AND tablename = 'canonical_project_body_anchor_sets'
     AND indexname = 'canonical_project_body_anchor_sets_owner_project_sequence_idx';

  IF sequence_index_definition IS NULL
     OR sequence_index_definition NOT LIKE '%USING btree (tenant_id, user_id, project_id, project_image_storage_id, acquisition_sequence DESC, anchor_set_id)%'
     OR sequence_index_definition LIKE '% WHERE %' THEN
    RAISE EXCEPTION 'canonical Project body-anchor acquisition-sequence index is missing or drifted; migration 032 refuses legacy-index removal';
  END IF;
END
$$;

DROP INDEX IF EXISTS canonical_project_body_anchor_sets_owner_project_idx;

COMMIT;
