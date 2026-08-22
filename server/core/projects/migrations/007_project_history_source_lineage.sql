BEGIN;

ALTER TABLE canonical_project_history
  ADD COLUMN source_image_storage_id uuid REFERENCES canonical_image_artifacts(storage_id);

UPDATE canonical_project_history h
SET source_image_storage_id = CASE
  WHEN h.kind='ORIGINAL' THEN h.image_storage_id
  ELSE COALESCE((
    SELECT previous.image_storage_id
    FROM canonical_project_history previous
    WHERE previous.project_id=h.project_id
      AND previous.ordinal<h.ordinal
      AND previous.created_at<=h.created_at
    ORDER BY previous.ordinal DESC, previous.created_at DESC
    LIMIT 1
  ), (SELECT p.original_image_storage_id FROM canonical_projects p WHERE p.project_id=h.project_id))
END
WHERE h.source_image_storage_id IS NULL;

ALTER TABLE canonical_project_history
  ALTER COLUMN source_image_storage_id SET NOT NULL;

COMMIT;
