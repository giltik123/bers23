BEGIN;
ALTER TABLE canonical_projects
  ADD COLUMN revision bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT canonical_projects_revision_check CHECK (revision >= 0);
COMMIT;
