import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function checkMaskArtifactSchema(pool: Pool): Promise<void> {
  const result = await pool.query(`SELECT
    to_regclass('canonical_mask_artifacts') IS NOT NULL AS table_present,
    (SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='canonical_mask_artifacts' AND column_name IN ('source_image_storage_id','parent_mask_storage_id','producer_operation')) AS lineage_columns,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_mask_artifacts') AND conname='canonical_mask_artifacts_source_image_fk' AND contype='f') AS source_fk,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_mask_artifacts') AND conname='canonical_mask_artifacts_parent_mask_fk' AND contype='f') AS parent_fk,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_mask_artifacts') AND conname='canonical_mask_artifacts_lineage_shape_check' AND contype='c') AS shape_check,
    to_regclass('canonical_mask_artifacts_source_image_idx') IS NOT NULL AS source_idx,
    to_regclass('canonical_mask_artifacts_parent_mask_idx') IS NOT NULL AS parent_idx`);
  const row = result.rows[0] ?? {};
  if (!row.table_present || !row.lineage_columns || !row.source_fk || !row.parent_fk || !row.shape_check || !row.source_idx || !row.parent_idx) {
    throw new Error('canonical MASK artifact schema is incomplete; apply migrations 002 and 014');
  }
}

export async function migrateMaskArtifactSchema(pool: Pool): Promise<void> {
  const exists = await pool.query("SELECT to_regclass('canonical_mask_artifacts')::text AS table_name");
  if (!exists.rows[0]?.table_name) await pool.query(await readFile(new URL('./migrations/002_canonical_mask_artifacts.sql', import.meta.url), 'utf8'));
  try { await checkMaskArtifactSchema(pool); return; } catch { /* apply idempotent lineage migration */ }
  await pool.query(await readFile(new URL('./migrations/014_canonical_mask_lineage.sql', import.meta.url), 'utf8'));
  await checkMaskArtifactSchema(pool);
}
