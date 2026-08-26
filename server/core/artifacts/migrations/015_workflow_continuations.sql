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
  input_artifacts_json jsonb NOT NULL,
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
  CONSTRAINT workflow_continuations_input_artifacts_shape_check CHECK (
    CASE
      WHEN jsonb_typeof(input_artifacts_json) = 'array'
      THEN jsonb_array_length(input_artifacts_json) > 0
      ELSE false
    END
  ),
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

-- C5A is still prerelease. Repair an empty earlier C5A table, but fail closed rather
-- than inventing immutable canonical input bindings for rows that already exist.
ALTER TABLE workflow_continuations
  ADD COLUMN IF NOT EXISTS input_artifacts_json jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM workflow_continuations WHERE input_artifacts_json IS NULL) THEN
    RAISE EXCEPTION 'cannot upgrade workflow_continuations with existing rows lacking immutable input bindings';
  END IF;
END $$;

ALTER TABLE workflow_continuations
  ALTER COLUMN input_artifacts_json SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'workflow_continuations'::regclass
      AND conname = 'workflow_continuations_input_artifacts_shape_check'
  ) THEN
    ALTER TABLE workflow_continuations
      ADD CONSTRAINT workflow_continuations_input_artifacts_shape_check CHECK (
        CASE
          WHEN jsonb_typeof(input_artifacts_json) = 'array'
          THEN jsonb_array_length(input_artifacts_json) > 0
          ELSE false
        END
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_continuations_scope_client_request_unique
  ON workflow_continuations (tenant_id, user_id, project_id, client_request_id);

CREATE INDEX IF NOT EXISTS workflow_continuations_scope_execution_idx
  ON workflow_continuations (tenant_id, user_id, project_id, execution_id);

CREATE INDEX IF NOT EXISTS workflow_continuations_outstanding_ticket_idx
  ON workflow_continuations (outstanding_ticket_id)
  WHERE outstanding_ticket_id IS NOT NULL;

COMMIT;
