import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { migrateImageArtifactSchema } from './imageArtifactSchema.ts';
import { migrateMaskArtifactSchema } from './maskArtifactSchema.ts';

export async function checkFinalImageLineageSchema(pool: Pool): Promise<void> {
  const result = await pool.query(`SELECT
    to_regclass('canonical_image_artifacts') IS NOT NULL AS image_table,
    to_regclass('canonical_mask_artifacts') IS NOT NULL AS mask_table,
    (SELECT count(*) = 3 FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_image_artifacts'
        AND column_name IN ('source_image_storage_id','mask_storage_id','producer_operation')) AS lineage_columns,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_image_artifacts') AND conname='canonical_image_artifacts_source_image_fk' AND contype='f') AS source_fk,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_image_artifacts') AND conname='canonical_image_artifacts_mask_fk' AND contype='f') AS mask_fk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_image_artifacts')
        AND conname='canonical_image_artifacts_lineage_shape_check'
        AND contype='c'
        AND position('BACKGROUND_ISOLATION' in pg_get_constraintdef(oid)) > 0
        AND position('CROP' in pg_get_constraintdef(oid)) > 0
    ) AS shape_check,
    to_regclass('canonical_image_artifacts_source_image_idx') IS NOT NULL AS source_idx,
    to_regclass('canonical_image_artifacts_mask_idx') IS NOT NULL AS mask_idx`);
  const row = result.rows[0] ?? {};
  if (!row.image_table || !row.mask_table || !row.lineage_columns || !row.source_fk || !row.mask_fk || !row.shape_check || !row.source_idx || !row.mask_idx) {
    throw new Error('canonical FINAL image lineage schema is incomplete; apply migrations 018_canonical_final_image_lineage.sql and 019_canonical_crop_final_lineage.sql');
  }
}

export async function migrateFinalImageLineageSchema(pool: Pool): Promise<void> {
  await migrateImageArtifactSchema(pool);
  await migrateMaskArtifactSchema(pool);
  try { await checkFinalImageLineageSchema(pool); return; } catch { /* apply exact lineage upgrades below */ }
  await pool.query(await readMigration('018_canonical_final_image_lineage.sql'));
  await pool.query(await readMigration('019_canonical_crop_final_lineage.sql'));
  await checkFinalImageLineageSchema(pool);
}

async function readMigration(name: string): Promise<string> {
  try {
    return await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8');
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error;
    return readFile(resolve(process.cwd(), `server/core/artifacts/migrations/${name}`), 'utf8');
  }
}
