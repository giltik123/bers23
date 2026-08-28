import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { migrateImageArtifactSchema } from './imageArtifactSchema.ts';

export async function checkMaskArtifactSchema(pool: Pool): Promise<void> {
  const result = await pool.query(`SELECT
    to_regclass('canonical_mask_artifacts') IS NOT NULL AS table_present,
    (SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='canonical_mask_artifacts' AND column_name IN ('source_image_storage_id','parent_mask_storage_id','producer_operation')) AS lineage_columns,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_mask_artifacts') AND conname='canonical_mask_artifacts_source_image_fk' AND contype='f') AS source_fk,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_mask_artifacts') AND conname='canonical_mask_artifacts_parent_mask_fk' AND contype='f') AS parent_fk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_mask_artifacts')
        AND conname='canonical_mask_artifacts_lineage_shape_check'
        AND contype='c'
        AND position('LOCAL_SEGMENTATION' in pg_get_constraintdef(oid)) > 0
    ) AS shape_check,
    to_regclass('canonical_mask_artifacts_source_image_idx') IS NOT NULL AS source_idx,
    to_regclass('canonical_mask_artifacts_parent_mask_idx') IS NOT NULL AS parent_idx`);
  const row = result.rows[0] ?? {};
  if (!row.table_present || !row.lineage_columns || !row.source_fk || !row.parent_fk || !row.shape_check || !row.source_idx || !row.parent_idx) {
    throw new Error('canonical MASK artifact schema is incomplete; apply migrations 002, 014 and 017');
  }
}

export async function migrateMaskArtifactSchema(pool: Pool): Promise<void> {
  const exists = await pool.query("SELECT to_regclass('canonical_mask_artifacts')::text AS table_name");
  if (!exists.rows[0]?.table_name) await pool.query(await readFile(new URL('./migrations/002_canonical_mask_artifacts.sql', import.meta.url), 'utf8'));
  try { await checkMaskArtifactSchema(pool); return; } catch { /* apply lineage upgrades below */ }
  // 014 has a foreign key to canonical_image_artifacts. Keep this dependency inside
  // the migrator so direct callers cannot accidentally make fresh installation order unsafe.
  await migrateImageArtifactSchema(pool);
  const lineageState = await pool.query(`SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='canonical_mask_artifacts' AND column_name='source_image_storage_id') AS has_source,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('canonical_mask_artifacts') AND conname='canonical_mask_artifacts_source_image_fk' AND contype='f') AS has_source_fk`);
  if (!lineageState.rows[0]?.has_source || !lineageState.rows[0]?.has_source_fk) await pool.query(await readLineageMigration());
  try { await checkMaskArtifactSchema(pool); return; } catch { /* apply LOCAL_SEGMENTATION shape upgrade below */ }
  await pool.query(await readLocalSegmentationLineageMigration());
  await checkMaskArtifactSchema(pool);
}

async function readLineageMigration(): Promise<string> {
  try {
    return await readFile(new URL('./migrations/014_canonical_mask_lineage.sql', import.meta.url), 'utf8');
  } catch (error) {
    // Bundled PostgreSQL tests historically copy only the base artifact migrations into
    // their output directory. During source-tree test execution use the canonical source
    // migration rather than weakening schema readiness. Production bundles contain 014.
    if (process.env.NODE_ENV === 'production') throw error;
    return readFile(resolve(process.cwd(), 'server/core/artifacts/migrations/014_canonical_mask_lineage.sql'), 'utf8');
  }
}

async function readLocalSegmentationLineageMigration(): Promise<string> {
  try {
    return await readFile(new URL('./migrations/017_local_segmentation_mask_lineage.sql', import.meta.url), 'utf8');
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error;
    return readFile(resolve(process.cwd(), 'server/core/artifacts/migrations/017_local_segmentation_mask_lineage.sql'), 'utf8');
  }
}
