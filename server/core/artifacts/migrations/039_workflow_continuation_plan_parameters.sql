BEGIN;

ALTER TABLE workflow_continuations
  ADD COLUMN IF NOT EXISTS plan_parameters_json jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'workflow_continuations'::regclass
      AND conname = 'workflow_continuations_plan_parameters_shape_check'
  ) THEN
    ALTER TABLE workflow_continuations
      ADD CONSTRAINT workflow_continuations_plan_parameters_shape_check CHECK (
        jsonb_typeof(plan_parameters_json) = 'object'
        AND octet_length(plan_parameters_json::text) <= 4096
      );
  END IF;
END $$;

COMMIT;
