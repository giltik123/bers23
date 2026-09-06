BEGIN;

ALTER TABLE canonical_execution_runs
  DROP CONSTRAINT canonical_execution_runs_capability_check,
  DROP CONSTRAINT canonical_execution_runs_authority_kind_check,
  DROP CONSTRAINT canonical_execution_runs_authority_binding_check;

ALTER TABLE canonical_execution_runs
  ADD CONSTRAINT canonical_execution_runs_capability_check CHECK (
    capability IN ('LOCAL_EXECUTION','CREATIVE_EXECUTION','WORKFLOW_CONTINUATION','WORKFLOW_STEP')
  ),
  ADD CONSTRAINT canonical_execution_runs_authority_kind_check CHECK (
    authority_kind IN ('LOCAL_EXECUTION_TICKET','CREATIVE_EXECUTION','WORKFLOW_CONTINUATION','WORKFLOW_INTERNAL_STEP')
  ),
  ADD CONSTRAINT canonical_execution_runs_authority_binding_check CHECK (
    (capability='LOCAL_EXECUTION' AND authority_kind='LOCAL_EXECUTION_TICKET')
    OR (capability='CREATIVE_EXECUTION' AND authority_kind='CREATIVE_EXECUTION')
    OR (capability='WORKFLOW_CONTINUATION' AND authority_kind='WORKFLOW_CONTINUATION')
    OR (capability='WORKFLOW_STEP' AND authority_kind='WORKFLOW_INTERNAL_STEP' AND parent_run_id IS NOT NULL)
  );

COMMIT;
