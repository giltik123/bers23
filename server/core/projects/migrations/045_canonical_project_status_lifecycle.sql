BEGIN;

-- Project lifecycle is server-owned. Reconstruct legacy/widened values from
-- durable Project history before sealing the accepted enum.
UPDATE canonical_projects AS p
SET status = CASE
  WHEN EXISTS (
    SELECT 1
    FROM canonical_project_history AS h
    WHERE h.project_id = p.project_id
      AND h.tenant_id = p.tenant_id
      AND h.user_id = p.user_id
      AND h.kind = 'ACCEPTED_FINAL'
  ) THEN 'editing'
  ELSE 'draft'
END;

ALTER TABLE canonical_projects
  ADD CONSTRAINT canonical_projects_status_check
  CHECK (status IN ('draft', 'editing'));

COMMIT;
