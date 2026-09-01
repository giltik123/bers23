import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import { migrateFinalImageLineageSchema } from '../artifacts/finalImageLineageSchema.ts';
import { checkGarmentWarpLayerSchema, migrateGarmentWarpLayerSchema } from './garmentWarpLayerSchema.ts';

const MIGRATION = '030_fashion_garment_texture_final_lineage.sql';
const EXTENSION_SAFE_REPAIR_MIGRATION = '033_fashion_garment_texture_repair_under_refinement.sql';
const IMAGE_TABLE = 'canonical_image_artifacts';
const LAYER_TABLE = 'canonical_fashion_garment_warp_layers';
const INSERT_TRIGGER = 'canonical_image_artifacts_fashion_texture_insert_guard';
const IMMUTABLE_TRIGGER = 'canonical_image_artifacts_fashion_texture_immut_guard';
const BEFORE_INSERT_ROW_TGTYPE = 7;
const BEFORE_UPDATE_ROW_TGTYPE = 19;

const canon = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').replace(/"/g, '').trim();

export async function checkGarmentTextureFinalLineageSchema(pool: Pool): Promise<void> {
  await checkGarmentWarpLayerSchema(pool);
  const refinementExtensionPresent = await hasRefinementLineageExtension(pool);
  const columns = await pool.query(`SELECT column_name,udt_name,is_nullable,character_maximum_length,column_default
    FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=$1
      AND column_name IN ('garment_warp_layer_id','garment_warp_layer_sha256','producer_parameters','producer_parameters_sha256')`, [IMAGE_TABLE]);
  const byName = new Map(columns.rows.map((row: any) => [String(row.column_name), row]));
  const layerId: any = byName.get('garment_warp_layer_id');
  const layerSha: any = byName.get('garment_warp_layer_sha256');
  const params: any = byName.get('producer_parameters');
  const paramsSha: any = byName.get('producer_parameters_sha256');
  if (
    byName.size !== 4
    || layerId?.udt_name !== 'uuid' || layerId?.is_nullable !== 'YES' || layerId?.column_default != null
    || layerSha?.udt_name !== 'bpchar' || layerSha?.is_nullable !== 'YES' || Number(layerSha?.character_maximum_length) !== 64 || layerSha?.column_default != null
    || params?.udt_name !== 'jsonb' || params?.is_nullable !== 'YES' || params?.column_default != null
    || paramsSha?.udt_name !== 'bpchar' || paramsSha?.is_nullable !== 'YES' || Number(paramsSha?.character_maximum_length) !== 64 || paramsSha?.column_default != null
  ) throw new Error('canonical Fashion texture FINAL lineage columns are incomplete or drifted; apply migration 030');

  const constraints = await pool.query(`SELECT c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    WHERE c.conrelid IN (to_regclass($1),to_regclass($2))`, [IMAGE_TABLE, LAYER_TABLE]);
  const byConstraint = new Map(constraints.rows.map((row: any) => [String(row.conname), row]));

  const evidenceUnique: any = byConstraint.get('canonical_fashion_garment_warp_layers_final_evidence_unique');
  if (!evidenceUnique || evidenceUnique.contype !== 'u' || !evidenceUnique.convalidated
      || canon(evidenceUnique.definition) !== 'UNIQUE (layer_id, content_sha256)') {
    throw new Error('canonical Fashion texture FINAL exact layer evidence key is incomplete or drifted');
  }

  const evidenceFk: any = byConstraint.get('canonical_image_artifacts_garment_warp_layer_evidence_fkey');
  const evidenceFkDef = canon(evidenceFk?.definition);
  if (
    !evidenceFk || evidenceFk.contype !== 'f' || !evidenceFk.convalidated
    || !evidenceFkDef.includes('FOREIGN KEY (garment_warp_layer_id, garment_warp_layer_sha256)')
    || !evidenceFkDef.includes('REFERENCES canonical_fashion_garment_warp_layers(layer_id, content_sha256)')
    || !evidenceFkDef.includes('ON DELETE RESTRICT')
  ) throw new Error('canonical Fashion texture FINAL layer evidence FK is incomplete or drifted');

  const hashCheck: any = byConstraint.get('canonical_image_artifacts_fashion_hashes_check');
  const hashDef = canon(hashCheck?.definition);
  if (
    !hashCheck || hashCheck.contype !== 'c' || !hashCheck.convalidated
    || !hashDef.includes("garment_warp_layer_sha256 ~ '^[0-9a-f]{64}$'::text")
    || !hashDef.includes("producer_parameters_sha256 ~ '^[0-9a-f]{64}$'::text")
  ) throw new Error('canonical Fashion texture FINAL hash policy is incomplete or drifted');

  const paramsCheck: any = byConstraint.get('canonical_image_artifacts_fashion_parameters_check');
  const paramsDef = canon(paramsCheck?.definition);
  for (const required of [
    'BERS_GARMENT_TEXTURE_COMPOSITE_Q16_V1',
    'SRGB_GAMMA_ENCODED_RGBA8',
    'CLAMP',
    'PRESERVE_BASE_ALPHA',
    'scaleXQ16',
    'scaleYQ16',
    'offsetXQ16',
    'offsetYQ16',
    'featherRadius',
    '4096',
    '1048576',
    '64',
  ]) {
    if (!paramsDef.includes(required)) throw new Error('canonical Fashion texture FINAL producer-parameter policy is incomplete or drifted');
  }
  if (!paramsCheck || paramsCheck.contype !== 'c' || !paramsCheck.convalidated) {
    throw new Error('canonical Fashion texture FINAL producer-parameter policy is incomplete or drifted');
  }

  // Before later Fashion lineage extensions exist, migration 030 owns the global
  // shape constraint and must verify it. Once F5 refinement columns are present,
  // the latest F5 schema layer owns that cross-operation constraint; F4 remains
  // responsible only for its own columns/FK/checks/index/triggers.
  if (!refinementExtensionPresent) {
    const shape: any = byConstraint.get('canonical_image_artifacts_lineage_shape_check');
    const shapeDef = canon(shape?.definition);
    for (const producer of ['BACKGROUND_ISOLATION','CROP','RESIZE','ORTHOGONAL_TRANSFORM','GARMENT_TEXTURE_COMPOSITE']) {
      if (!shapeDef.includes(producer)) throw new Error('canonical FINAL image lineage shape policy is incomplete after Fashion migration 030');
    }
    for (const field of ['garment_warp_layer_id','garment_warp_layer_sha256','producer_parameters','producer_parameters_sha256']) {
      if (!shapeDef.includes(field)) throw new Error('canonical FINAL image lineage shape policy does not close Fashion-specific fields');
    }
    if (!shape || shape.contype !== 'c' || !shape.convalidated) {
      throw new Error('canonical FINAL image lineage shape policy is incomplete after Fashion migration 030');
    }
  }

  const index = await pool.query(`SELECT indexdef FROM pg_indexes
    WHERE schemaname=current_schema() AND tablename=$1 AND indexname='canonical_image_artifacts_garment_warp_layer_idx'`, [IMAGE_TABLE]);
  const indexDef = canon(index.rows[0]?.indexdef);
  if (
    !indexDef.includes('USING btree (garment_warp_layer_id)')
    || !indexDef.includes('garment_warp_layer_id IS NOT NULL')
  ) throw new Error('canonical Fashion texture FINAL layer index is incomplete or drifted');

  const triggers = await pool.query(`SELECT t.tgname,t.tgtype,t.tgenabled,p.proname
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid=to_regclass($1) AND NOT t.tgisinternal
      AND t.tgname = ANY($2::text[])`, [IMAGE_TABLE, [INSERT_TRIGGER, IMMUTABLE_TRIGGER]]);
  const triggerMap = new Map(triggers.rows.map((row: any) => [String(row.tgname), row]));
  const insert: any = triggerMap.get(INSERT_TRIGGER);
  const immutable: any = triggerMap.get(IMMUTABLE_TRIGGER);
  if (
    triggerMap.size !== 2
    || Number(insert?.tgtype) !== BEFORE_INSERT_ROW_TGTYPE
    || insert?.tgenabled !== 'O'
    || insert?.proname !== 'canonical_assert_fashion_texture_final_insert'
    || Number(immutable?.tgtype) !== BEFORE_UPDATE_ROW_TGTYPE
    || immutable?.tgenabled !== 'O'
    || immutable?.proname !== 'canonical_fashion_texture_final_lineage_immutable_guard'
  ) throw new Error('canonical Fashion texture FINAL lineage triggers are incomplete, drifted or disabled');
}

export async function migrateGarmentTextureFinalLineageSchema(pool: Pool): Promise<void> {
  await migrateFinalImageLineageSchema(pool);
  await migrateGarmentWarpLayerSchema(pool);
  try {
    await checkGarmentTextureFinalLineageSchema(pool);
    return;
  } catch {
    // Repair below using the schema layer that owns the currently visible shape.
  }
  const migration = await hasRefinementLineageExtension(pool)
    ? EXTENSION_SAFE_REPAIR_MIGRATION
    : MIGRATION;
  await pool.query(await readMigration(migration));
  await checkGarmentTextureFinalLineageSchema(pool);
}

async function hasRefinementLineageExtension(pool: Pool): Promise<boolean> {
  const result = await pool.query(`SELECT COUNT(*)::int AS count
    FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=$1
      AND column_name IN ('refinement_parent_storage_id','refinement_parent_sha256','refinement_profile','refinement_support_sha256','refinement_producer_parameters','refinement_producer_parameters_sha256')`, [IMAGE_TABLE]);
  const count = Number(result.rows[0]?.count ?? 0);
  if (count !== 0 && count !== 6) {
    throw new Error('canonical Fashion refinement FINAL lineage extension is partially present; latest schema layer must repair it');
  }
  return count === 6;
}

async function readMigration(name: string): Promise<string> {
  try {
    return await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8');
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error;
    return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', name), 'utf8');
  }
}
