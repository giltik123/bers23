import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function checkLocalExecutionUploadSchema(pool: Pool): Promise<void> {
  const result = await pool.query("SELECT to_regclass('local_execution_uploads')::text AS table_name");
  if (!result.rows[0]?.table_name) throw new Error('local execution upload schema is incomplete; apply migration 012_local_execution_uploads.sql');
}

export async function migrateLocalExecutionUploadSchema(pool: Pool): Promise<void> {
  const exists = await pool.query("SELECT to_regclass('local_execution_uploads')::text AS table_name");
  if (exists.rows[0]?.table_name) return;
  await pool.query(await readFile(new URL('./migrations/012_local_execution_uploads.sql', import.meta.url), 'utf8'));
}
