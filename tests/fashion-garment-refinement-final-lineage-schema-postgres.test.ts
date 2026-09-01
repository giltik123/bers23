import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  checkGarmentTextureFinalLineageSchema,
} from '../server/core/fashion/garmentTextureFinalLineageSchema.ts';
import {
  checkGarmentAppearanceRefinementFinalLineageSchema,
  migrateGarmentAppearanceRefinementFinalLineageSchema,
} from '../server/core/fashion/garmentAppearanceRefinementFinalLineageSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F5a.2 refinement lineage schema acceptance');

const schemaError = /refinement.*lineage|refinement.*index|refinement.*triggers|incomplete|drifted/i;

test('F5a.2 schema is dual-bound, minimal-child, idempotent and F4-compatible', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-f5a2-dual-bound-lineage' });
  try {
    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);
    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);
    await checkGarmentTextureFinalLineageSchema(pool);

    const columns = await pool.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_image_artifacts'
        AND column_name LIKE 'refinement_%' ORDER BY column_name`);
    assert.deepEqual(columns.rows.map(row => String(row.column_name)), [
      'refinement_contract_version',
      'refinement_parent_image_sha256',
      'refinement_parent_image_storage_id',
      'refinement_profile',
    ]);

    const functionDef = await pool.query(`SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=current_schema() AND p.proname='canonical_assert_fashion_refinement_final_insert'`);
    const triggerLaw = String(functionDef.rows[0]?.definition ?? '').replace(/\s+/g, ' ');
    for (const required of [
      'p.current_image_storage_id = NEW.source_image_storage_id',
      'parent_image.storage_id = NEW.refinement_parent_image_storage_id',
      "parent_image.producer_operation = 'GARMENT_TEXTURE_COMPOSITE'",
      'parent_image.source_image_storage_id = NEW.source_image_storage_id',
      "encode(sha256(parent_image.image_bytes), 'hex'::text) = NEW.refinement_parent_image_sha256",
    ]) assert.ok(triggerLaw.includes(required), `missing dual-bound trigger law: ${required}`);

    const shape = await pool.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_image_artifacts') AND conname='canonical_image_artifacts_lineage_shape_check'`);
    const shapeLaw = String(shape.rows[0]?.definition ?? '').replace(/\s+/g, ' ');
    assert.ok(shapeLaw.includes('GARMENT_APPEARANCE_REFINEMENT'));
    assert.ok(shapeLaw.includes('refinement_parent_image_storage_id IS NOT NULL'));
    assert.ok(shapeLaw.includes('refinement_parent_image_sha256 IS NOT NULL'));
    assert.ok(shapeLaw.includes('garment_warp_layer_id IS NULL'));
    assert.ok(shapeLaw.includes('producer_parameters IS NULL'));

    await pool.query('ALTER TABLE canonical_image_artifacts DISABLE TRIGGER canonical_image_artifacts_fashion_refinement_insert_guard');
    await assert.rejects(checkGarmentAppearanceRefinementFinalLineageSchema(pool), schemaError);
    await pool.query('ALTER TABLE canonical_image_artifacts ENABLE TRIGGER canonical_image_artifacts_fashion_refinement_insert_guard');
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);

    await pool.query('DROP INDEX canonical_image_artifacts_refinement_parent_idx');
    await assert.rejects(checkGarmentAppearanceRefinementFinalLineageSchema(pool), schemaError);
    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);
    await checkGarmentTextureFinalLineageSchema(pool);
  } finally {
    await pool.end();
  }
});
