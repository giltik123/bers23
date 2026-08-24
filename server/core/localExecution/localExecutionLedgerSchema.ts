import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

type LocalExecutionLedgerSchemaState = Readonly<{
  ticketTable: boolean;
  finalizationColumns: boolean;
  scopedIdempotencyUnique: boolean;
  legacyGlobalIdempotencyUnique: boolean;
  maskTicketColumn: boolean;
  maskTicketUnique: boolean;
  uploadArtifactRoleNotNull: boolean;
}>;

export async function checkLocalExecutionLedgerSchema(pool: Pool): Promise<void> {
  const state = await inspectLocalExecutionLedgerSchema(pool);
  if (
    !state.ticketTable ||
    !state.finalizationColumns ||
    !state.scopedIdempotencyUnique ||
    state.legacyGlobalIdempotencyUnique ||
    !state.maskTicketColumn ||
    !state.maskTicketUnique ||
    !state.uploadArtifactRoleNotNull
  ) throw new Error('local execution ledger schema is incomplete; apply migration 013_local_execution_ticket_ledger.sql');
}

export async function migrateLocalExecutionLedgerSchema(pool: Pool): Promise<void> {
  const state = await inspectLocalExecutionLedgerSchema(pool);
  if (
    state.ticketTable &&
    state.finalizationColumns &&
    state.scopedIdempotencyUnique &&
    !state.legacyGlobalIdempotencyUnique &&
    state.maskTicketColumn &&
    state.maskTicketUnique &&
    state.uploadArtifactRoleNotNull
  ) return;
  await pool.query(await readFile(new URL('../artifacts/migrations/013_local_execution_ticket_ledger.sql', import.meta.url), 'utf8'));
  await checkLocalExecutionLedgerSchema(pool);
}

async function inspectLocalExecutionLedgerSchema(pool: Pool): Promise<LocalExecutionLedgerSchemaState> {
  const result = await pool.query(`SELECT
    to_regclass('local_execution_tickets') IS NOT NULL AS ticket_table,
    (
      SELECT count(*) = 2
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'local_execution_tickets'
        AND column_name IN ('finalized_status','finalized_at')
    ) AS finalization_columns,
    EXISTS (
      SELECT 1
      FROM pg_class i
      JOIN pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = current_schema()
        AND i.relname = 'local_execution_tickets_scope_idempotency_unique'
        AND x.indisunique
        AND ARRAY(
          SELECT a.attname
          FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
          ORDER BY k.ord
        ) = ARRAY['tenant_id','user_id','project_id','idempotency_key']::name[]
    ) AS scoped_idempotency_unique,
    EXISTS (
      SELECT 1
      FROM pg_index x
      JOIN pg_class t ON t.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = current_schema()
        AND t.relname = 'local_execution_tickets'
        AND x.indisunique
        AND ARRAY(
          SELECT a.attname
          FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
          ORDER BY k.ord
        ) = ARRAY['idempotency_key']::name[]
    ) AS legacy_global_idempotency_unique,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'canonical_mask_artifacts'
        AND column_name = 'local_execution_ticket_id'
    ) AS mask_ticket_column,
    EXISTS (
      SELECT 1
      FROM pg_class i
      JOIN pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_index x ON x.indexrelid = i.oid
      WHERE n.nspname = current_schema()
        AND i.relname = 'canonical_mask_artifacts_local_execution_ticket_unique'
        AND x.indisunique
        AND ARRAY(
          SELECT a.attname
          FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
          ORDER BY k.ord
        ) = ARRAY['local_execution_ticket_id']::name[]
    ) AS mask_ticket_unique,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'local_execution_uploads'
        AND column_name = 'artifact_role'
        AND is_nullable = 'NO'
    ) AS upload_artifact_role_not_null`);
  const row = result.rows[0] ?? {};
  return Object.freeze({
    ticketTable: row.ticket_table === true,
    finalizationColumns: row.finalization_columns === true,
    scopedIdempotencyUnique: row.scoped_idempotency_unique === true,
    legacyGlobalIdempotencyUnique: row.legacy_global_idempotency_unique === true,
    maskTicketColumn: row.mask_ticket_column === true,
    maskTicketUnique: row.mask_ticket_unique === true,
    uploadArtifactRoleNotNull: row.upload_artifact_role_not_null === true,
  });
}
