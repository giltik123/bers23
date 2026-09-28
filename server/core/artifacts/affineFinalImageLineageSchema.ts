import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

import { migrateFinalImageLineageSchema } from './finalImageLineageSchema.ts';

const MIGRATION = '045_canonical_affine_transform_final_lineage.sql';

export async function checkAffineFinalImageLineageSchema(pool: Pool): Promise<void> {
  const result = await pool.query(`SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_image_artifacts')
      AND conname='canonical_image_artifacts_lineage_shape_check'
      AND contype='c'
      AND convalidated
      AND position('AFFINE_TRANSFORM' in pg_get_constraintdef(oid)) > 0
  ) AS affine_lineage`);
  if (!result.rows[0]?.affine_lineage) throw new Error('canonical Affine FINAL lineage schema is incomplete; apply migration 045_canonical_affine_transform_final_lineage.sql');
}

export async function migrateAffineFinalImageLineageSchema(pool: Pool): Promise<void> {
  await migrateFinalImageLineageSchema(pool);
  try { await checkAffineFinalImageLineageSchema(pool); return; } catch { /* apply exact Affine extension below */ }
  await pool.query(await readMigration());
  await checkAffineFinalImageLineageSchema(pool);
}

async function readMigration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch (error) {
    if (process.env.NODE_ENV === 'production') throw error;
    return readFile(resolve(process.cwd(), 'server/core/artifacts/migrations', MIGRATION), 'utf8');
  }
}
