import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  checkGarmentAppearanceRefinementFinalLineageSchema,
  migrateGarmentAppearanceRefinementFinalLineageSchema,
} from '../server/core/fashion/garmentAppearanceRefinementFinalLineageSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F5a.2 refinement lineage drift acceptance');

const schemaError = /refinement FINAL lineage shape|triggers are incomplete|drifted/i;

test('F5a.2 schema checker rejects branch-specific weakening and disabled authority triggers', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-f5a2-refinement-schema-drift' });
  try {
    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);

    // Preserve all producer/field keywords that the older token-presence checker
    // looked for, while intentionally removing producer_parameters NULL binding
    // from the F5 branch. The tightened checker must still reject this weakening.
    await pool.query('ALTER TABLE canonical_image_artifacts DROP CONSTRAINT canonical_image_artifacts_lineage_shape_check');
    await pool.query(`ALTER TABLE canonical_image_artifacts
      ADD CONSTRAINT canonical_image_artifacts_lineage_shape_check CHECK (
        producer_operation IS NULL
        OR producer_operation = 'BACKGROUND_ISOLATION'
        OR producer_operation = 'CROP'
        OR producer_operation = 'RESIZE'
        OR producer_operation = 'ORTHOGONAL_TRANSFORM'
        OR producer_operation = 'GARMENT_TEXTURE_COMPOSITE'
        OR (
          producer_operation = 'GARMENT_APPEARANCE_REFINEMENT'
          AND source_image_storage_id IS NOT NULL
          AND mask_storage_id IS NULL
          AND garment_warp_layer_id IS NOT NULL
          AND garment_warp_layer_sha256 IS NOT NULL
          AND refinement_profile = 'REFINE_REALISM_V1'
          AND refinement_contract_version = '1'
        )
        OR producer_parameters IS NULL
        OR producer_parameters_sha256 IS NULL
      )`);
    await assert.rejects(checkGarmentAppearanceRefinementFinalLineageSchema(pool), schemaError);

    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);

    await pool.query('ALTER TABLE canonical_image_artifacts DISABLE TRIGGER canonical_image_artifacts_fashion_refinement_insert_guard');
    await assert.rejects(checkGarmentAppearanceRefinementFinalLineageSchema(pool), schemaError);
    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);

    const trigger = await pool.query(`SELECT tgenabled FROM pg_trigger
      WHERE tgrelid=to_regclass('canonical_image_artifacts')
        AND tgname='canonical_image_artifacts_fashion_refinement_insert_guard'`);
    assert.equal(trigger.rows[0]?.tgenabled, 'O', 'repair must recreate an enabled F5 insert guard');
  } finally {
    await pool.end();
  }
});
