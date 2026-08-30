import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '028_project_body_anchor_sets.sql';
const EXPECTED_COLUMNS = Object.freeze([
  ['anchor_set_id', 'uuid', false],
  ['tenant_id', 'text', false],
  ['user_id', 'text', false],
  ['project_id', 'uuid', false],
  ['project_image_storage_id', 'uuid', false],
  ['project_image_sha256', 'bpchar', false],
  ['project_image_width', 'int4', false],
  ['project_image_height', 'int4', false],
  ['schema_id', 'text', false],
  ['coordinate_space', 'text', false],
  ['anchor_payload', 'jsonb', false],
  ['anchor_payload_sha256', 'bpchar', false],
  ['producer_id', 'text', false],
  ['producer_version', 'text', false],
  ['created_at', 'timestamptz', false],
] as const);

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}

async function ready(pool: Pool): Promise<boolean> {
  const structural = await pool.query(`SELECT
    to_regclass('canonical_project_body_anchor_sets')::text AS relation,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_project_body_anchor_sets') AND contype='p'
        AND pg_get_constraintdef(oid)='PRIMARY KEY (anchor_set_id)'
    ) AS primary_key,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='canonical_project_body_anchor_sets_owner_unique'
        AND conrelid=to_regclass('canonical_project_body_anchor_sets') AND contype='u' AND convalidated
    ) AS owner_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_project_body_anchor_sets') AND contype='f'
        AND confrelid=to_regclass('canonical_projects') AND convalidated
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (project_id) REFERENCES canonical_projects(project_id)%ON DELETE RESTRICT%'
    ) AS project_fk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_project_body_anchor_sets') AND contype='f'
        AND confrelid=to_regclass('canonical_image_artifacts') AND convalidated
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (project_image_storage_id) REFERENCES canonical_image_artifacts(storage_id)%ON DELETE RESTRICT%'
    ) AS image_fk,
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid=to_regclass('canonical_project_body_anchor_sets') AND NOT tgisinternal
        AND tgname='canonical_project_body_anchor_sets_insert_guard' AND tgenabled='O'
    ) AS insert_guard,
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid=to_regclass('canonical_project_body_anchor_sets') AND NOT tgisinternal
        AND tgname='canonical_project_body_anchor_sets_immutable_guard' AND tgenabled='O'
    ) AS immutable_guard,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname=current_schema() AND tablename='canonical_project_body_anchor_sets'
        AND indexname='canonical_project_body_anchor_sets_owner_project_idx'
    ) AS owner_index`);
  const row = structural.rows[0];
  if (!row?.relation || !row.primary_key || !row.owner_unique || !row.project_fk || !row.image_fk || !row.insert_guard || !row.immutable_guard || !row.owner_index) return false;

  const columns = await pool.query(`SELECT column_name,udt_name,is_nullable,character_maximum_length,column_default
    FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='canonical_project_body_anchor_sets'`);
  const byName = new Map(columns.rows.map(candidate => [String(candidate.column_name), candidate]));
  if (byName.size !== EXPECTED_COLUMNS.length) return false;
  for (const [name, type, nullable] of EXPECTED_COLUMNS) {
    const candidate = byName.get(name);
    if (!candidate || String(candidate.udt_name) !== type || ((String(candidate.is_nullable) === 'YES') !== nullable)) return false;
    if ((name === 'project_image_sha256' || name === 'anchor_payload_sha256') && Number(candidate.character_maximum_length) !== 64) return false;
    if (name === 'created_at' && !String(candidate.column_default ?? '').trim()) return false;
  }
  return true;
}

export async function checkProjectBodyAnchorSchema(pool: Pool): Promise<void> {
  if (!await ready(pool)) throw new Error('canonical Project body anchor schema is incomplete; apply migration 028');
}

export async function migrateProjectBodyAnchorSchema(pool: Pool): Promise<void> {
  const relation = await pool.query(`SELECT to_regclass('canonical_project_body_anchor_sets')::text AS relation`);
  if (!relation.rows[0]?.relation) await pool.query(await migration());
  await checkProjectBodyAnchorSchema(pool);
}
