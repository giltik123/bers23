import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Garment representation lifecycle acceptance');

const owner = Object.freeze({ tenantId: 'fashion-representation-lifecycle-tenant', userId: 'fashion-representation-lifecycle-user' });
const limits = Object.freeze({ maxUploadBytes: 1024 * 1024, maxDimension: 64, maxPixels: 4096 });

async function image(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 30, g: 80, b: 130, alpha: 1 } },
  }).png().toBuffer());
}

async function reset(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS
    canonical_garment_representation_sources,
    canonical_garment_representations,
    canonical_outfit_entries,
    canonical_outfits,
    canonical_garment_collection_members,
    canonical_garment_collections,
    canonical_garment_tags,
    canonical_garment_views,
    canonical_garments
    CASCADE`);
  await migrateGarmentSchema(pool);
}

function parametricPayload(): unknown {
  return {
    schemaVersion: 1,
    coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
    points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
    triangles: [[0, 1, 2], [0, 2, 3]],
    outline: [0, 1, 2, 3],
  };
}

test('F4a revocation timestamp is database-owned once and immutable after revocation', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);

    const created = await garments.createWithInitialView(owner, {
      name: 'Lifecycle jacket',
      viewKind: 'FRONT',
      sourceContentType: 'image/png',
      bytes: await image(),
    }, limits);
    const classified = await wardrobe.updateMetadata(owner, created.id, created.revision, { category: 'jackets' });
    const admitted = await representations.admit(owner, created.id, classified.revision, {
      tier: 'PARAMETRIC',
      generatorId: 'local.lifecycle-fixture',
      generatorVersion: '1.0.0',
      sourceViewIds: [created.primaryViewId],
      payload: parametricPayload(),
    });
    assert.equal(admitted.representation.admissionState, 'ADMITTED');
    assert.equal(admitted.representation.revokedAt, null);

    const bogusRevokedAt = '2000-01-01T00:00:00.000Z';
    const transitionStartedAt = Date.now();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE canonical_garment_representations
        SET admission_state='REVOKED', revoked_at=$5::timestamptz
        WHERE representation_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4`,
      [admitted.representation.id, created.id, owner.tenantId, owner.userId, bogusRevokedAt]);
      const updated = await client.query(`UPDATE canonical_garments
        SET representation_tier='BASIC', revision=revision+1, updated_at=CURRENT_TIMESTAMP
        WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND revision=$4
        RETURNING revision`,
      [created.id, owner.tenantId, owner.userId, admitted.garmentRevision]);
      assert.equal(updated.rowCount, 1);
      assert.equal(Number(updated.rows[0]?.revision), admitted.garmentRevision + 1);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const lifecycle = await pool.query(`SELECT admission_state,revoked_at FROM canonical_garment_representations
      WHERE representation_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4`,
    [admitted.representation.id, created.id, owner.tenantId, owner.userId]);
    assert.equal(lifecycle.rows[0]?.admission_state, 'REVOKED');
    const revokedAt = new Date(lifecycle.rows[0]?.revoked_at).toISOString();
    assert.notEqual(revokedAt, bogusRevokedAt, 'caller-provided revocation time must not become canonical evidence');
    const revokedMs = Date.parse(revokedAt);
    assert.ok(revokedMs >= transitionStartedAt - 1000 && revokedMs <= Date.now() + 5000, 'revocation time must be assigned by PostgreSQL at the transition');

    await assert.rejects(
      pool.query(`UPDATE canonical_garment_representations SET revoked_at='2001-01-01T00:00:00Z'::timestamptz
        WHERE representation_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4`,
      [admitted.representation.id, created.id, owner.tenantId, owner.userId]),
      /revoked garment representation lifecycle is immutable/i,
    );
    await assert.rejects(
      pool.query(`UPDATE canonical_garment_representations SET admission_state='ADMITTED', revoked_at=NULL
        WHERE representation_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4`,
      [admitted.representation.id, created.id, owner.tenantId, owner.userId]),
      /cannot be re-admitted|lifecycle is immutable/i,
    );

    const unchanged = await pool.query(`SELECT revoked_at FROM canonical_garment_representations
      WHERE representation_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4`,
    [admitted.representation.id, created.id, owner.tenantId, owner.userId]);
    assert.equal(new Date(unchanged.rows[0]?.revoked_at).toISOString(), revokedAt);

    const current = (await garments.get(owner, created.id))!;
    assert.equal(current.revision, admitted.garmentRevision + 1);
    assert.equal(current.representationTier, 'BASIC');
    const noOp = await representations.revoke(owner, created.id, admitted.representation.id, current.revision);
    assert.equal(noOp.garmentRevision, current.revision);
    assert.equal(noOp.representationTier, 'BASIC');
    assert.equal(noOp.representation.admissionState, 'REVOKED');
    assert.equal(noOp.representation.revokedAt, revokedAt);
    assert.equal((await garments.get(owner, created.id))?.revision, current.revision);
  } finally {
    await pool.end();
  }
});
