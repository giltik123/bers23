import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { checkLocalExecutionLedgerSchema } from '../localExecution/localExecutionLedgerSchema.ts';

type WorkflowContinuationSchemaState = Readonly<{
  table: boolean;
  scopeClientRequestUnique: boolean;
  outstandingTicketForeignKey: boolean;
  completedStepsJson: boolean;
  revision: boolean;
}>;

export async function checkWorkflowContinuationSchema(pool: Pool): Promise<void> {
  const state = await inspectWorkflowContinuationSchema(pool);
  if (!state.table || !state.scopeClientRequestUnique || !state.outstandingTicketForeignKey || !state.completedStepsJson || !state.revision) {
    throw new Error('workflow continuation schema is incomplete; apply migration 015_workflow_continuations.sql');
  }
}

export async function migrateWorkflowContinuationSchema(pool: Pool): Promise<void> {
  await checkLocalExecutionLedgerSchema(pool);
  const state = await inspectWorkflowContinuationSchema(pool);
  if (state.table && state.scopeClientRequestUnique && state.outstandingTicketForeignKey && state.completedStepsJson && state.revision) return;
  await pool.query(await readFile(new URL('../artifacts/migrations/015_workflow_continuations.sql', import.meta.url), 'utf8'));
  await checkWorkflowContinuationSchema(pool);
}

async function inspectWorkflowContinuationSchema(pool: Pool): Promise<WorkflowContinuationSchemaState> {
  const result = await pool.query(`SELECT
    to_regclass('workflow_continuations') IS NOT NULL AS table_exists,
    EXISTS (
      SELECT 1
      FROM pg_class i
      JOIN pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = current_schema()
        AND i.relname = 'workflow_continuations_scope_client_request_unique'
        AND x.indisunique
        AND ARRAY(
          SELECT a.attname
          FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
          ORDER BY k.ord
        ) = ARRAY['tenant_id','user_id','project_id','client_request_id']::name[]
    ) AS scope_client_request_unique,
    EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.constraint_schema = kcu.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.constraint_schema = ccu.constraint_schema
      WHERE tc.constraint_schema = current_schema()
        AND tc.table_name = 'workflow_continuations'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'outstanding_ticket_id'
        AND ccu.table_name = 'local_execution_tickets'
        AND ccu.column_name = 'ticket_id'
    ) AS outstanding_ticket_foreign_key,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'workflow_continuations'
        AND column_name = 'completed_steps_json'
        AND data_type = 'jsonb'
        AND is_nullable = 'NO'
    ) AS completed_steps_json,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'workflow_continuations'
        AND column_name = 'revision'
        AND data_type = 'bigint'
        AND is_nullable = 'NO'
    ) AS revision`);
  const row = result.rows[0] ?? {};
  return Object.freeze({
    table: row.table_exists === true,
    scopeClientRequestUnique: row.scope_client_request_unique === true,
    outstandingTicketForeignKey: row.outstanding_ticket_foreign_key === true,
    completedStepsJson: row.completed_steps_json === true,
    revision: row.revision === true,
  });
}
