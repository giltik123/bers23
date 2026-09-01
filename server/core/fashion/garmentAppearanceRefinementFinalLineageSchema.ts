import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { checkGarmentTextureFinalLineageSchema, migrateGarmentTextureFinalLineageSchema } from './garmentTextureFinalLineageSchema.ts';

const MIGRATION = '032_fashion_garment_refinement_final_lineage.sql';
const IMAGE_TABLE = 'canonical_image_artifacts';
const INSERT_TRIGGER = 'canonical_image_artifacts_fashion_refinement_insert_guard';
const IMMUTABLE_TRIGGER = 'canonical_image_artifacts_fashion_refinement_immut_guard';
const BEFORE_INSERT_ROW_TGTYPE = 7;
const BEFORE_UPDATE_ROW_TGTYPE = 19;
const canon = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').replace(/"/g, '').trim();

export async function checkGarmentAppearanceRefinementFinalLineageSchema(pool: Pool): Promise<void> {
  await checkGarmentTextureFinalLineageSchema(pool);

  const columns = await pool.query(`SELECT column_name,udt_name,is_nullable,character_maximum_length,column_default
    FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=$1
      AND column_name IN ('refinement_parent_image_storage_id','refinement_parent_image_sha256','refinement_profile','refinement_contract_version')`, [IMAGE_TABLE]);
  const byName = new Map(columns.rows.map((row: any) => [String(row.column_name), row]));
  const parentId: any = byName.get('refinement_parent_image_storage_id');
  const parentSha: any = byName.get('refinement_parent_image_sha256');
  const profile: any = byName.get('refinement_profile');
  const version: any = byName.get('refinement_contract_version');
  if (
    byName.size !== 4
    || parentId?.udt_name !== 'uuid' || parentId?.is_nullable !== 'YES' || parentId?.column_default != null
    || parentSha?.udt_name !== 'bpchar' || parentSha?.is_nullable !== 'YES' || Number(parentSha?.character_maximum_length) !== 64 || parentSha?.column_default != null
    || profile?.udt_name !== 'text' || profile?.is_nullable !== 'YES' || profile?.column_default != null
    || version?.udt_name !== 'text' || version?.is_nullable !== 'YES' || version?.column_default != null
  ) throw new Error('canonical Fashion refinement FINAL lineage columns are incomplete or drifted; apply migration 032');

  const constraints = await pool.query(`SELECT c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c WHERE c.conrelid=to_regclass($1)`, [IMAGE_TABLE]);
  const byConstraint = new Map(constraints.rows.map((row: any) => [String(row.conname), row]));

  const parentFk: any = byConstraint.get('canonical_image_artifacts_refinement_parent_fkey');
  const parentFkDef = canon(parentFk?.definition);
  if (!parentFk || parentFk.contype !== 'f' || !parentFk.convalidated
      || !parentFkDef.includes('FOREIGN KEY (refinement_parent_image_storage_id)')
      || !parentFkDef.includes('REFERENCES canonical_image_artifacts(storage_id)')
      || !parentFkDef.includes('ON DELETE RESTRICT')) {
    throw new Error('canonical Fashion refinement deterministic-parent FK is incomplete or drifted');
  }

  const identity: any = byConstraint.get('canonical_image_artifacts_refinement_identity_check');
  const identityDef = canon(identity?.definition);
  if (!identity || identity.contype !== 'c' || !identity.convalidated
      || !identityDef.includes("refinement_parent_image_sha256 ~ '^[0-9a-f]{64}$'::text")
      || !identityDef.includes('REFINE_REALISM_V1')
      || !identityDef.includes("refinement_contract_version = '1'::text")) {
    throw new Error('canonical Fashion refinement identity/hash policy is incomplete or drifted');
  }

  const shape: any = byConstraint.get('canonical_image_artifacts_lineage_shape_check');
  const shapeDef = canon(shape?.definition);
  for (const required of [
    'GARMENT_APPEARANCE_REFINEMENT',
    'GARMENT_TEXTURE_COMPOSITE',
    'refinement_parent_image_storage_id',
    'refinement_parent_image_sha256',
    'refinement_profile',
    'refinement_contract_version',
    'garment_warp_layer_id IS NULL',
    'producer_parameters IS NULL',
  ]) {
    if (!shapeDef.includes(required)) throw new Error('canonical Fashion refinement minimal-child lineage shape is incomplete or drifted');
  }
  if (!shape || shape.contype !== 'c' || !shape.convalidated) {
    throw new Error('canonical Fashion refinement minimal-child lineage shape is incomplete or drifted');
  }

  const index = await pool.query(`SELECT indexdef FROM pg_indexes
    WHERE schemaname=current_schema() AND tablename=$1 AND indexname='canonical_image_artifacts_refinement_parent_idx'`, [IMAGE_TABLE]);
  const indexDef = canon(index.rows[0]?.indexdef);
  if (!indexDef.includes('USING btree (refinement_parent_image_storage_id)')
      || !indexDef.includes("producer_operation = 'GARMENT_APPEARANCE_REFINEMENT'::text")) {
    throw new Error('canonical Fashion refinement deterministic-parent index is incomplete or drifted');
  }

  const triggers = await pool.query(`SELECT t.tgname,t.tgtype,t.tgenabled,p.proname
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid=to_regclass($1) AND NOT t.tgisinternal
      AND t.tgname = ANY($2::text[])`, [IMAGE_TABLE, [INSERT_TRIGGER, IMMUTABLE_TRIGGER]]);
  const triggerMap = new Map(triggers.rows.map((row: any) => [String(row.tgname), row]));
  const insert: any = triggerMap.get(INSERT_TRIGGER);
  const immutable: any = triggerMap.get(IMMUTABLE_TRIGGER);
  if (triggerMap.size !== 2
      || Number(insert?.tgtype) !== BEFORE_INSERT_ROW_TGTYPE || insert?.tgenabled !== 'O' || insert?.proname !== 'canonical_assert_fashion_refinement_final_insert'
      || Number(immutable?.tgtype) !== BEFORE_UPDATE_ROW_TGTYPE || immutable?.tgenabled !== 'O' || immutable?.proname !== 'canonical_fashion_refinement_final_lineage_immutable_guard') {
    throw new Error('canonical Fashion refinement FINAL lineage triggers are incomplete, drifted or disabled');
  }
}

export async function migrateGarmentAppearanceRefinementFinalLineageSchema(pool: Pool): Promise<void> {
  await migrateGarmentTextureFinalLineageSchema(pool);
  try {
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);
    return;
  } catch {
    // Apply the exact idempotent F5 lineage extension below.
  }
  await pool.query(await readMigration());
  await checkGarmentAppearanceRefinementFinalLineageSchema(pool);
}

async function readMigration(): Promise<string> {
  try {
    return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8');
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error;
    return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8');
  }
}
