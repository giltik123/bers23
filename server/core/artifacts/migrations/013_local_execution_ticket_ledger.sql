BEGIN;

CREATE TABLE IF NOT EXISTS local_execution_tickets (
  ticket_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id text NOT NULL,
  request_id text NOT NULL,
  workflow_id text NOT NULL,
  step_id text NOT NULL,
  ticket_json jsonb NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS local_execution_tickets_scope_idx
  ON local_execution_tickets (tenant_id, user_id, project_id, ticket_id);

CREATE INDEX IF NOT EXISTS local_execution_tickets_request_idx
  ON local_execution_tickets (request_id, tenant_id, user_id, project_id);

ALTER TABLE canonical_mask_artifacts
  ADD COLUMN IF NOT EXISTS local_execution_ticket_id text;

CREATE UNIQUE INDEX IF NOT EXISTS canonical_mask_artifacts_local_execution_ticket_unique
  ON canonical_mask_artifacts (local_execution_ticket_id)
  WHERE local_execution_ticket_id IS NOT NULL;

COMMIT;
