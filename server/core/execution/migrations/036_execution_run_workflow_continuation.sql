BEGIN;

ALTER TABLE canonical_execution_runs
  DROP CONSTRAINT canonical_execution_runs_capability_check,
  DROP CONSTRAINT canonical_execution_runs_authority_kind_check,
  DROP CONSTRAINT canonical_execution_runs_authority_binding_check,
  DROP CONSTRAINT canonical_execution_runs_status_check,
  DROP CONSTRAINT canonical_execution_runs_time_shape_check,
  DROP CONSTRAINT canonical_execution_runs_reason_shape_check;

ALTER TABLE canonical_execution_runs
  ADD CONSTRAINT canonical_execution_runs_capability_check CHECK (
    capability IN ('LOCAL_EXECUTION','CREATIVE_EXECUTION','WORKFLOW_CONTINUATION')
  ),
  ADD CONSTRAINT canonical_execution_runs_authority_kind_check CHECK (
    authority_kind IN ('LOCAL_EXECUTION_TICKET','CREATIVE_EXECUTION','WORKFLOW_CONTINUATION')
  ),
  ADD CONSTRAINT canonical_execution_runs_authority_binding_check CHECK (
    (capability='LOCAL_EXECUTION' AND authority_kind='LOCAL_EXECUTION_TICKET')
    OR (capability='CREATIVE_EXECUTION' AND authority_kind='CREATIVE_EXECUTION')
    OR (capability='WORKFLOW_CONTINUATION' AND authority_kind='WORKFLOW_CONTINUATION')
  ),
  ADD CONSTRAINT canonical_execution_runs_status_check CHECK (
    status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','UNKNOWN')
  ),
  ADD CONSTRAINT canonical_execution_runs_time_shape_check CHECK (
    (status='QUEUED' AND started_at IS NULL AND finished_at IS NULL)
    OR (status='RUNNING' AND started_at IS NOT NULL AND finished_at IS NULL)
    OR (status IN ('SUCCEEDED','FAILED','CANCELLED','UNKNOWN') AND finished_at IS NOT NULL)
  ),
  ADD CONSTRAINT canonical_execution_runs_reason_shape_check CHECK (
    (status IN ('FAILED','CANCELLED','UNKNOWN') AND status_reason_code IS NOT NULL)
    OR (status NOT IN ('FAILED','CANCELLED','UNKNOWN') AND status_reason_code IS NULL)
  );

COMMIT;
