BEGIN;

CREATE TABLE IF NOT EXISTS workflow_continuations (
  execution_id text PRIMARY KEY,
  client_request_id text NOT NULL,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id text NOT NULL,
  plan_id text NOT NULL,
  plan_revision text NOT NULL,
  plan_digest text NOT NULL CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN (
    'READY',
    'WAITING_FOR_LOCAL_RESULT',
    'RUNNING_INTERNAL',
    'SUCCESS',
    'FAILED',
    'CANCELLED',
    'UNKNOWN'
  )),
  current_step_id text,
  outstanding_ticket_id text REFERENCES local_execution_tickets(ticket_id) ON DELETE RESTRICT,
  outstanding_ticket_version text,
  outstanding_ticket_nonce text,
  outstanding_ticket_expires_at timestamptz,
  completed_steps_json jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(completed_steps_json) = 'array'),
  terminal_artifact_id text,
  failure_code text,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (
      state = 'WAITING_FOR_LOCAL_RESULT'
      AND current_step_id IS NOT NULL
      AND outstanding_ticket_id IS NOT NULL
      AND outstanding_ticket_version IS NOT NULL
      AND outstanding_ticket_nonce IS NOT NULL
      AND outstanding_ticket_expires_at IS NOT NULL
    )
    OR
    (
      state <> 'WAITING_FOR_LOCAL_RESULT'
      AND outstanding_ticket_id IS NULL
      AND outstanding_ticket_version IS NULL
      AND outstanding_ticket_nonce IS NULL
      AND outstanding_ticket_expires_at IS NULL
    )
  ),
  CHECK (state <> 'RUNNING_INTERNAL' OR current_step_id IS NOT NULL),
  CHECK ((state = 'SUCCESS' AND terminal_artifact_id IS NOT NULL) OR state <> 'SUCCESS')
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_continuations_scope_client_request_unique
  ON workflow_continuations (tenant_id, user_id, project_id, client_request_id);

CREATE INDEX IF NOT EXISTS workflow_continuations_scope_execution_idx
  ON workflow_continuations (tenant_id, user_id, project_id, execution_id);

CREATE INDEX IF NOT EXISTS workflow_continuations_outstanding_ticket_idx
  ON workflow_continuations (outstanding_ticket_id)
  WHERE outstanding_ticket_id IS NOT NULL;

COMMIT;
