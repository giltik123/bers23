import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '022_managed_garments_and_initial_views.sql';

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}

async function schemaState(pool: Pool) {
  const result = await pool.query(`SELECT
    to_regclass('canonical_garments')::text AS garments,
    to_regclass('canonical_garment_views')::text AS views,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_garments' AND column_name='representation_tier'
    ) AS representation_tier,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_garment_views' AND column_name='content_sha256'
    ) AS content_hash,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_garment_views' AND column_name='storage_backend'
    ) AS storage_provenance,
    EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid=to_regclass('canonical_garments') AND attname='primary_view_id' AND attnotnull AND NOT attisdropped
    ) AS primary_view_not_null,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments') AND contype='p'
        AND pg_get_constraintdef(oid)='PRIMARY KEY (garment_id)'
    ) AS garment_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_views') AND contype='p'
        AND pg_get_constraintdef(oid)='PRIMARY KEY (view_id)'
    ) AS view_pk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments') AND contype='u'
        AND pg_get_constraintdef(oid)='UNIQUE (garment_id, tenant_id, user_id)'
    ) AS garment_owner_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_views') AND contype='u'
        AND pg_get_constraintdef(oid)='UNIQUE (view_id, garment_id, tenant_id, user_id)'
    ) AS view_owner_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_views') AND contype='u'
        AND pg_get_constraintdef(oid)='UNIQUE (garment_id, ordinal)'
    ) AS garment_ordinal_unique,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_views') AND contype='f'
        AND confrelid=to_regclass('canonical_garments')
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%'
    ) AS view_owner_fk,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments') AND contype='f'
        AND confrelid=to_regclass('canonical_garment_views')
        AND condeferrable AND condeferred
        AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (primary_view_id, garment_id, tenant_id, user_id) REFERENCES canonical_garment_views(view_id, garment_id, tenant_id, user_id)%'
    ) AS primary_view_owner_fk`);
  return result.rows[0];
}

function schemaReady(state: any): boolean {
  return Boolean(
    state?.garments
    && state?.views
    && state?.representation_tier
    && state?.content_hash
    && state?.storage_provenance
    && state?.primary_view_not_null
    && state?.garment_pk
    && state?.view_pk
    && state?.garment_owner_unique
    && state?.view_owner_unique
    && state?.garment_ordinal_unique
    && state?.view_owner_fk
    && state?.primary_view_owner_fk
  );
}

export async function checkGarmentSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!schemaReady(state)) {
    throw new Error('canonical managed Garment schema or ownership constraints are incomplete; apply migration 022');
  }
}

export async function migrateGarmentSchema(pool: Pool): Promise<void> {
  const state = await schemaState(pool);
  if (!schemaReady(state)) {
    await pool.query(await migration());
  }
  await checkGarmentSchema(pool);
}
