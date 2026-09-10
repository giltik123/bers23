import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const REVISION_MIGRATION = '044_canonical_project_revision.sql';
const REVISION_CONSTRAINT = 'canonical_projects_revision_check';

async function migration(name: string) {
  try { return await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/projects/migrations', name), 'utf8'); }
}

async function hardened(pool: Pool) {
  const result = await pool.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='canonical_project_history' AND column_name='execution_id') AS hardened");
  return Boolean(result.rows[0]?.hardened);
}

async function sourceLineage(pool: Pool) {
  const result = await pool.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='canonical_project_history' AND column_name='source_image_storage_id') AS lineage");
  return Boolean(result.rows[0]?.lineage);
}

async function revisionColumnExists(pool: Pool): Promise<boolean> {
  const result = await pool.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='canonical_projects' AND column_name='revision') AS present");
  return Boolean(result.rows[0]?.present);
}

async function revisionReady(pool: Pool): Promise<boolean> {
  const [column, constraint] = await Promise.all([
    pool.query("SELECT udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='canonical_projects' AND column_name='revision'"),
    pool.query(`SELECT convalidated,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid=to_regclass('canonical_projects') AND conname=$1`, [REVISION_CONSTRAINT]),
  ]);
  const value = column.rows[0];
  const check = constraint.rows[0];
  if (!value || String(value.udt_name) !== 'int8' || String(value.is_nullable) !== 'NO' || semanticDefault(value.column_default) !== '0') return false;
  return check?.convalidated === true && semanticConstraint(check.definition) === 'checkrevision>=0';
}

export async function checkProjectSchema(pool: Pool) {
  const result = await pool.query("SELECT to_regclass('canonical_projects')::text AS projects, to_regclass('canonical_project_history')::text AS history, to_regclass('canonical_project_versions')::text AS versions");
  if (!result.rows[0]?.projects || !result.rows[0]?.history || !result.rows[0]?.versions) throw new Error('canonical Project schema is incomplete; apply migrations 004 and 005');
  if (!await hardened(pool)) throw new Error('canonical Project history schema is incomplete; apply migration 006');
  if (!await sourceLineage(pool)) throw new Error('canonical Project history source lineage is incomplete; apply migration 007');
  if (!await revisionReady(pool)) throw new Error('canonical Project revision schema is incomplete or permissive; apply exact migration 044');
}

export async function migrateProjectSchema(pool: Pool) {
  let result = await pool.query("SELECT to_regclass('canonical_projects')::text AS projects");
  if (!result.rows[0]?.projects) await pool.query(await migration('004_canonical_projects_and_originals.sql'));
  result = await pool.query("SELECT to_regclass('canonical_project_history')::text AS history");
  if (!result.rows[0]?.history) await pool.query(await migration('005_canonical_project_history_versions.sql'));
  if (!await hardened(pool)) await pool.query(await migration('006_project_history_acceptance_hardening.sql'));
  if (!await sourceLineage(pool)) await pool.query(await migration('007_project_history_source_lineage.sql'));
  if (!await revisionReady(pool)) {
    if (await revisionColumnExists(pool)) throw new Error('canonical Project revision schema is incomplete or permissive; refusing to repair a partial/widened revision authority');
    await pool.query(await migration(REVISION_MIGRATION));
  }
  await checkProjectSchema(pool);
}

function semanticDefault(value: unknown): string {
  return String(value ?? '').replace(/::(?:bigint|int8|integer)/giu, '').replace(/[()\s]+/gu, '').toLowerCase();
}

function semanticConstraint(value: unknown): string {
  return String(value ?? '').replace(/::(?:bigint|int8|integer)/giu, '').replace(/[()\s]+/gu, '').toLowerCase();
}
