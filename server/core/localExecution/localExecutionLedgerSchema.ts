import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function checkLocalExecutionLedgerSchema(pool: Pool): Promise<void> {
  const result = await pool.query(`SELECT
    to_regclass('local_execution_tickets')::text AS ticket_table,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'canonical_mask_artifacts'
        AND column_name = 'local_execution_ticket_id'
    ) AS mask_ticket_column`);
  const row = result.rows[0];
  if (!row?.ticket_table || row.mask_ticket_column !== true) throw new Error('local execution ledger schema is incomplete; apply migration 013_local_execution_ticket_ledger.sql');
}

export async function migrateLocalExecutionLedgerSchema(pool: Pool): Promise<void> {
  const ready = await pool.query(`SELECT
    to_regclass('local_execution_tickets')::text AS ticket_table,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'canonical_mask_artifacts'
        AND column_name = 'local_execution_ticket_id'
    ) AS mask_ticket_column`);
  const row = ready.rows[0];
  if (row?.ticket_table && row.mask_ticket_column === true) return;
  await pool.query(await readFile(new URL('../artifacts/migrations/013_local_execution_ticket_ledger.sql', import.meta.url), 'utf8'));
}
