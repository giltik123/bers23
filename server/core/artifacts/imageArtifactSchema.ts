import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
export async function checkImageArtifactSchema(pool: Pool) { const result = await pool.query("SELECT to_regclass('canonical_image_artifacts')::text AS table_name"); if (!result.rows[0]?.table_name) throw new Error('canonical FINAL image artifact schema is incomplete; apply migration 003_canonical_final_image_artifacts.sql'); }
export async function migrateImageArtifactSchema(pool: Pool) { const result = await pool.query("SELECT to_regclass('canonical_image_artifacts')::text AS table_name"); if (!result.rows[0]?.table_name) await pool.query(await readFile(new URL('./migrations/003_canonical_final_image_artifacts.sql', import.meta.url), 'utf8')); }
