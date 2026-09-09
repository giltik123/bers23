BEGIN;

-- C3d owns recurring trigger timing/claim/replay only. WorkflowContinuation + ExecutionRun
-- remain the sole execution-state authorities; no provider, Billing, Artifact or run state lives here.
CREATE TABLE IF NOT EXISTS canonical_automation_schedules (
  schedule_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  automation_id uuid NOT NULL,
  definition_revision bigint NOT NULL,
  project_id uuid NOT NULL,
  interval_seconds integer NOT NULL,
  next_fire_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  revision bigint NOT NULL DEFAULT 1,
  overlap_policy text NOT NULL DEFAULT 'SKIP_WHILE_ACTIVE',
  missed_run_policy text NOT NULL DEFAULT 'ONE_CATCH_UP',
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT canonical_automation_schedules_owner_check CHECK (
    btrim(tenant_id) <> '' AND octet_length(tenant_id) <= 256
    AND btrim(user_id) <> '' AND octet_length(user_id) <= 256
  ),
  CONSTRAINT canonical_automation_schedules_definition_revision_check CHECK (definition_revision >= 1),
  CONSTRAINT canonical_automation_schedules_interval_check CHECK (interval_seconds BETWEEN 60 AND 2592000),
  CONSTRAINT canonical_automation_schedules_status_check CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')),
  CONSTRAINT canonical_automation_schedules_revision_check CHECK (revision >= 1),
  CONSTRAINT canonical_automation_schedules_overlap_policy_check CHECK (overlap_policy = 'SKIP_WHILE_ACTIVE'),
  CONSTRAINT canonical_automation_schedules_missed_run_policy_check CHECK (missed_run_policy = 'ONE_CATCH_UP'),
  CONSTRAINT canonical_automation_schedules_lease_pair_check CHECK (
    (lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT canonical_automation_schedules_inactive_lease_check CHECK (
    status = 'ACTIVE' OR (lease_token IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS canonical_automation_schedules_scope_updated_idx
  ON canonical_automation_schedules (tenant_id, user_id, status, updated_at DESC, schedule_id);

CREATE INDEX IF NOT EXISTS canonical_automation_schedules_due_idx
  ON canonical_automation_schedules (next_fire_at, schedule_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS canonical_automation_schedules_lease_expiry_idx
  ON canonical_automation_schedules (lease_expires_at, schedule_id)
  WHERE lease_token IS NOT NULL;

-- One row is one deterministic trigger decision. The row is never execution truth.
-- For EXECUTE, immutable C3b invocation binding is created first; this occurrence is then
-- inserted with that invocation id before AutomationManualExecutionService.resume delegates.
CREATE TABLE IF NOT EXISTS canonical_automation_trigger_occurrences (
  occurrence_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  schedule_id uuid NOT NULL,
  schedule_revision bigint NOT NULL,
  automation_id uuid NOT NULL,
  definition_revision bigint NOT NULL,
  project_id uuid NOT NULL,
  scheduled_for timestamptz NOT NULL,
  decision text NOT NULL,
  client_request_id text NOT NULL,
  invocation_id uuid,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT canonical_automation_trigger_occurrences_owner_check CHECK (
    btrim(tenant_id) <> '' AND octet_length(tenant_id) <= 256
    AND btrim(user_id) <> '' AND octet_length(user_id) <= 256
  ),
  CONSTRAINT canonical_automation_trigger_occurrences_revision_check CHECK (
    schedule_revision >= 1 AND definition_revision >= 1
  ),
  CONSTRAINT canonical_automation_trigger_occurrences_decision_check CHECK (
    decision IN ('EXECUTE','SKIPPED_ACTIVE','SKIPPED_CONFIGURATION')
  ),
  CONSTRAINT canonical_automation_trigger_occurrences_client_request_check CHECK (
    client_request_id ~ '^automation-schedule-v1-[0-9a-f]{64}$'
  ),
  CONSTRAINT canonical_automation_trigger_occurrences_invocation_check CHECK (
    (decision = 'EXECUTE' AND invocation_id IS NOT NULL)
    OR (decision IN ('SKIPPED_ACTIVE','SKIPPED_CONFIGURATION') AND invocation_id IS NULL)
  ),
  CONSTRAINT canonical_automation_trigger_occurrences_identity_unique UNIQUE (
    schedule_id, schedule_revision, scheduled_for
  ),
  CONSTRAINT canonical_automation_trigger_occurrences_request_unique UNIQUE (
    tenant_id, user_id, client_request_id
  ),
  CONSTRAINT canonical_automation_trigger_occurrences_invocation_unique UNIQUE (
    tenant_id, user_id, invocation_id
  )
);

CREATE INDEX IF NOT EXISTS canonical_automation_trigger_occurrences_scope_idx
  ON canonical_automation_trigger_occurrences
  (tenant_id, user_id, schedule_id, scheduled_for DESC, occurrence_id);

-- Supports bounded DISTINCT ON(schedule_id) recovery sweeps. Older EXECUTE rows for one schedule
-- cannot be active once a newer EXECUTE was admitted under SKIP_WHILE_ACTIVE.
CREATE INDEX IF NOT EXISTS canonical_automation_trigger_occurrences_recovery_idx
  ON canonical_automation_trigger_occurrences
  (schedule_id, scheduled_for DESC, occurrence_id DESC, invocation_id)
  WHERE decision = 'EXECUTE';

CREATE OR REPLACE FUNCTION canonical_automation_trigger_occurrence_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'canonical Automation trigger occurrence is immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS canonical_automation_trigger_occurrences_immutable_guard
  ON canonical_automation_trigger_occurrences;
CREATE TRIGGER canonical_automation_trigger_occurrences_immutable_guard
  BEFORE UPDATE OR DELETE ON canonical_automation_trigger_occurrences
  FOR EACH ROW EXECUTE FUNCTION canonical_automation_trigger_occurrence_immutable_guard();

COMMIT;
