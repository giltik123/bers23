BEGIN;

ALTER TABLE local_execution_tickets
  ADD COLUMN IF NOT EXISTS admitted_result_sha256 text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'local_execution_tickets'::regclass
      AND conname = 'local_execution_tickets_admitted_result_sha256_check'
  ) THEN
    ALTER TABLE local_execution_tickets
      ADD CONSTRAINT local_execution_tickets_admitted_result_sha256_check
      CHECK (admitted_result_sha256 IS NULL OR admitted_result_sha256 ~ '^[a-f0-9]{64}$');
  END IF;
END $$;

COMMIT;
