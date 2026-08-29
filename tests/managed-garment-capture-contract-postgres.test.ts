import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { assessManagedGarmentCapture } from '../server/core/fashion/garmentCaptureAssessment.ts';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for managed Garment capture contract acceptance');

const owner = Object.freeze({ tenantId: 'fashion-f1b-capture-tenant', userId: 'fashion-f1b-capture-owner' });
const limits = Object.freeze({ maxUploadBytes: 4 * 1024 * 1024, maxDimension: 1024, maxPixels: 1024 * 1024 });

async function jpeg(width: number, height: number): Promise<Uint8Array> {
  const rgba = Buffer.alloc(width * height * 4, 127);
  for (let index = 3; index < rgba.length; index += 4) rgba[index] = 255;
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).jpeg({ quality: 90 }).toBuffer());
}

test('F1b keeps UNSPECIFIED initial-only and does not claim technical resolution without cardinal evidence', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  await migrateGarmentSchema(pool);
  await pool.query('TRUNCATE canonical_garment_views,canonical_garments CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_garment_views,canonical_garments CASCADE').catch(() => undefined);
    await pool.end();
  });

  const store = new PostgresGarmentStore(pool);
  const bytes = await jpeg(640, 640);
  const initial = await store.createWithInitialView(owner, {
    name: 'Unclassified initial capture',
    viewKind: 'UNSPECIFIED',
    sourceContentType: 'image/jpeg',
    bytes,
  }, limits);

  const initialAssessment = assessManagedGarmentCapture(initial);
  assert.equal(initialAssessment.cardinalCoverageScore, 0);
  assert.equal(initialAssessment.cardinalComplete, false);
  assert.deepEqual(initialAssessment.presentCardinalViewKinds, []);
  assert.deepEqual(initialAssessment.missingCardinalViewKinds, ['FRONT', 'BACK', 'LEFT', 'RIGHT']);
  assert.equal(initialAssessment.unspecifiedViewCount, 1);
  assert.equal(initialAssessment.technicalResolution.status, 'NOT_ASSESSED');
  assert.equal(initialAssessment.technicalResolution.minimumBestCardinalShortEdgePx, null);

  await assert.rejects(
    () => store.appendView(owner, initial.id, initial.revision, {
      viewKind: 'UNSPECIFIED',
      sourceContentType: 'image/jpeg',
      bytes,
    }, limits),
    (error: unknown) => {
      const candidate = error as { status?: unknown; code?: unknown };
      assert.equal(candidate.status, 400);
      assert.equal(candidate.code, 'unspecified_garment_view_append');
      return true;
    },
  );

  const unchanged = await store.get(owner, initial.id);
  assert.equal(unchanged?.revision, 1);
  assert.equal(unchanged?.views.length, 1);
  assert.equal(unchanged?.views[0]?.kind, 'UNSPECIFIED');
});
