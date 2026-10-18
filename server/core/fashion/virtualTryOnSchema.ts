import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
export async function checkVirtualTryOnSchema(pool: Pool): Promise<void> {
  const result = await pool.query(`SELECT convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid=to_regclass('canonical_image_artifacts') AND conname='canonical_image_artifacts_lineage_shape_check'`);
  const trigger = await pool.query(`SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('canonical_image_artifacts') AND tgname='canonical_image_artifacts_virtual_try_on_source' AND tgenabled='O' AND tgtype=7 AND NOT tgisinternal`);
  const immutable = await pool.query(`SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('canonical_image_artifacts') AND tgname='canonical_image_artifacts_virtual_try_on_immutable' AND tgenabled='O' AND tgtype=19 AND NOT tgisinternal`);
  if (!immutable.rows.length || !trigger.rows.length || !result.rows[0]?.convalidated || !result.rows[0]?.definition?.includes('VIRTUAL_TRY_ON')) throw new Error('Apply migration 049_virtual_try_on_final_lineage.sql before enabling Virtual Try-On');
}
export async function migrateVirtualTryOnSchema(pool: Pool): Promise<void> {
  try { await checkVirtualTryOnSchema(pool); return; } catch { /* apply additive policy */ }
  let sql: string;
  try { sql = await readFile(new URL('./migrations/049_virtual_try_on_final_lineage.sql', import.meta.url), 'utf8'); }
  catch { sql = await readFile(resolve('dist-server/migrations/049_virtual_try_on_final_lineage.sql'), 'utf8'); }
  await pool.query(sql);
  await checkVirtualTryOnSchema(pool);
}
