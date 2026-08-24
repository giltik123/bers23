import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

type LocalExecutionLedgerSchemaState = Readonly<{
  ticketTable: boolean;
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
    to_regclass('local_execution_tickets_scope_idempotency_unique') IS NOT NULL AS scoped_idempotency_unique,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = current_schema()
        AND t.relname = 'local_execution_tickets'
        AND c.contype = 'u'
        AND c.conname = 'local_execution_tickets_idempotency_key_key'
    ) AS legacy_global_idempotency_unique,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'canonical_mask_artifacts'
        AND column_name = 'local_execution_ticket_id'
    ) AS mask_ticket_column,
    to_regclass('canonical_mask_artifacts_local_execution_ticket_unique') IS NOT NULL AS mask_ticket_unique,
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
    scopedIdempotencyUnique: row.scoped_idempotency_unique === true,
    legacyGlobalIdempotencyUnique: row.legacy_global_idempotency_unique === true,
    maskTicketColumn: row.mask_ticket_column === true,
    maskTicketUnique: row.mask_ticket_unique === true,
    uploadArtifactRoleNotNull: row.upload_artifact_role_not_null === true,
  });
}
