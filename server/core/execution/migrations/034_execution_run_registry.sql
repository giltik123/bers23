BEGIN;

CREATE TABLE IF NOT EXISTS canonical_execution_runs (
  run_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id uuid NOT NULL,
  capability text NOT NULL,
  idempotency_key text NOT NULL,
  authority_kind text NOT NULL,
  authority_ref text NOT NULL,
  parent_run_id uuid NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  revision bigint NOT NULL DEFAULT 1,
  status_reason_code text NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  CONSTRAINT canonical_execution_runs_project_fkey FOREIGN KEY (project_id) REFERENCES canonical_projects(project_id) ON DELETE RESTRICT,
  CONSTRAINT canonical_execution_runs_parent_run_id_fkey FOREIGN KEY (parent_run_id) REFERENCES canonical_execution_runs(run_id) ON DELETE RESTRICT,
  CONSTRAINT canonical_execution_runs_capability_check CHECK (capability IN ('LOCAL_EXECUTION','CREATIVE_EXECUTION')),
  CONSTRAINT canonical_execution_runs_authority_kind_check CHECK (authority_kind IN ('LOCAL_EXECUTION_TICKET','CREATIVE_EXECUTION')),
  CONSTRAINT canonical_execution_runs_status_check CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  CONSTRAINT canonical_execution_runs_revision_check CHECK (revision >= 1),
  CONSTRAINT canonical_execution_runs_idempotency_key_check CHECK (char_length(idempotency_key) BETWEEN 1 AND 256 AND idempotency_key !~ '[[:cntrl:]]'),
  CONSTRAINT canonical_execution_runs_authority_ref_check CHECK (char_length(authority_ref) BETWEEN 1 AND 4096 AND authority_ref !~ '[[:cntrl:]]'),
  CONSTRAINT canonical_execution_runs_reason_check CHECK (status_reason_code IS NULL OR status_reason_code ~ '^[A-Z0-9_]{1,128}$'),
  CONSTRAINT canonical_execution_runs_scope_idempotency_unique UNIQUE (tenant_id,user_id,project_id,capability,idempotency_key),
  CONSTRAINT canonical_execution_runs_scope_authority_unique UNIQUE (tenant_id,user_id,project_id,authority_kind,authority_ref),
  CONSTRAINT canonical_execution_runs_time_shape_check CHECK (
    (status='QUEUED' AND started_at IS NULL AND finished_at IS NULL)
    OR (status='RUNNING' AND started_at IS NOT NULL AND finished_at IS NULL)
    OR (status IN ('SUCCEEDED','FAILED','CANCELLED') AND finished_at IS NOT NULL)
  ),
  CONSTRAINT canonical_execution_runs_reason_shape_check CHECK (
    (status IN ('FAILED','CANCELLED') AND status_reason_code IS NOT NULL)
    OR (status NOT IN ('FAILED','CANCELLED') AND status_reason_code IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS canonical_execution_runs_scope_created_idx
  ON canonical_execution_runs (tenant_id,user_id,project_id,created_at DESC,run_id DESC);
CREATE INDEX IF NOT EXISTS canonical_execution_runs_parent_idx
  ON canonical_execution_runs (parent_run_id) WHERE parent_run_id IS NOT NULL;

COMMIT;
