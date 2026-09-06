BEGIN;

CREATE TABLE IF NOT EXISTS execution_run_steps (
  run_id uuid NOT NULL,
  step_id text NOT NULL,
  source_authority text NOT NULL,
  status text NOT NULL,
  revision bigint NOT NULL DEFAULT 1,
  local_ticket_id uuid NULL,
  artifact_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status_reason_code text NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamptz NULL,
  CONSTRAINT execution_run_steps_pkey PRIMARY KEY (run_id,step_id),
  CONSTRAINT execution_run_steps_run_fkey FOREIGN KEY (run_id) REFERENCES canonical_execution_runs(run_id) ON DELETE CASCADE,
  CONSTRAINT execution_run_steps_source_authority_check CHECK (source_authority='WORKFLOW_CONTINUATION'),
  CONSTRAINT execution_run_steps_status_check CHECK (status IN ('WAITING_FOR_LOCAL_RESULT','RUNNING_INTERNAL','SUCCEEDED','FAILED','CANCELLED','UNKNOWN')),
  CONSTRAINT execution_run_steps_revision_check CHECK (revision >= 1),
  CONSTRAINT execution_run_steps_step_id_check CHECK (char_length(step_id) BETWEEN 1 AND 256 AND step_id !~ '[[:cntrl:]]'),
  CONSTRAINT execution_run_steps_reason_check CHECK (status_reason_code IS NULL OR status_reason_code ~ '^[A-Z0-9_]{1,128}$'),
  CONSTRAINT execution_run_steps_artifact_ids_shape_check CHECK (jsonb_typeof(artifact_ids_json)='array'),
  CONSTRAINT execution_run_steps_terminal_shape_check CHECK (
    (status IN ('WAITING_FOR_LOCAL_RESULT','RUNNING_INTERNAL') AND finished_at IS NULL AND status_reason_code IS NULL AND jsonb_array_length(artifact_ids_json)=0)
    OR (status='SUCCEEDED' AND finished_at IS NOT NULL AND status_reason_code IS NULL AND jsonb_array_length(artifact_ids_json)>0)
    OR (status IN ('FAILED','CANCELLED','UNKNOWN') AND finished_at IS NOT NULL AND status_reason_code IS NOT NULL AND jsonb_array_length(artifact_ids_json)=0)
  ),
  CONSTRAINT execution_run_steps_local_ticket_shape_check CHECK (
    (status='WAITING_FOR_LOCAL_RESULT' AND local_ticket_id IS NOT NULL)
    OR (status='RUNNING_INTERNAL' AND local_ticket_id IS NULL)
    OR (status IN ('FAILED','CANCELLED','UNKNOWN'))
    OR status='SUCCEEDED'
  )
);

CREATE INDEX IF NOT EXISTS execution_run_steps_run_created_idx
  ON execution_run_steps (run_id,created_at,step_id);

COMMIT;
