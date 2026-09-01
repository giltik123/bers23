import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { migrateProjectBodyAnchorSchema } from '../server/core/fashion/bodyAnchorSchema.ts';
import { BODY_ANCHOR_COORDINATE_SPACE } from '../server/core/fashion/bodyAnchorGeometry.ts';
import { PostgresProjectBodyAnchorStore } from '../server/core/fashion/postgresProjectBodyAnchorStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F4b.6c.2a anchor sequence acceptance');

const owner = Object.freeze({ tenantId: 'f4b6c2a-tenant', userId: 'f4b6c2a-user' });
const projectLimits = Object.freeze({ maxDimension: 1200, maxPixels: 1_500_000 });

function anchors(offset = 0) {
  return Object.freeze({
    schemaVersion: 1,
    coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE,
    anchors: Object.freeze({
      leftShoulder: Object.freeze([0.2 + offset, 0.1] as const),
      rightShoulder: Object.freeze([0.8 - offset, 0.1] as const),
      leftHip: Object.freeze([0.25 + offset, 0.8] as const),
      rightHip: Object.freeze([0.75 - offset, 0.8] as const),
    }),
  });
}

async function image(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 120, height: 160, channels: 4, background: { r: 30 + seed, g: 70 + seed, b: 120 + seed, alpha: 1 } },
  }).png().toBuffer());
}

async function currentEvidence(pool: Pool, projectId: string) {
  const result = await pool.query(`SELECT a.storage_id,a.width,a.height,a.image_bytes
    FROM canonical_projects p
    JOIN canonical_image_artifacts a
      ON a.storage_id=p.current_image_storage_id
     AND a.tenant_id=p.tenant_id AND a.user_id=p.user_id AND a.project_id=p.project_id::text
    WHERE p.project_id=$1 AND p.tenant_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL`,
  [projectId, owner.tenantId, owner.userId]);
  const row = result.rows[0];
  if (!row) throw new Error('Current Project evidence fixture is unavailable');
  return Object.freeze({
    storageId: String(row.storage_id).toLowerCase(),
    sha256: createHash('sha256').update(new Uint8Array(row.image_bytes)).digest('hex'),
    width: Number(row.width),
    height: Number(row.height),
  });
}

async function countAnchors(pool: Pool, projectId: string): Promise<number> {
  const result = await pool.query(`SELECT count(*)::int AS count FROM canonical_project_body_anchor_sets
    WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3`, [projectId, owner.tenantId, owner.userId]);
  return Number(result.rows[0]?.count);
}

test('F4b.6c.2a exact-source creation is pre-insert guarded and sequence-ordered under concurrency', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-f4b6c2a-anchor-sequence' });
  try {
    await migrateProjectBodyAnchorSchema(pool);
    const projects = new PostgresProjectStore(pool);
    const project = await projects.create(owner, 'F4b.6c.2a anchor source', await image(1), projectLimits);
    const projectId = String(project.project_id).toLowerCase();
    const expected = await currentEvidence(pool, projectId);

    const store = new PostgresProjectBodyAnchorStore(pool);
    const first = await store.createForExpectedImage(owner, projectId, expected, {
      payload: anchors(), producerId: 'bers.manual-body-anchors', producerVersion: '1',
    });
    assert.match(first.acquisitionSequence, /^[1-9][0-9]*$/);
    assert.equal(typeof first.acquisitionSequence, 'string');
    assert.equal(first.projectImageStorageId, expected.storageId);
    assert.equal(first.projectImageSha256, expected.sha256);

    const beforeStaleHash = await countAnchors(pool, projectId);
    await assert.rejects(
      store.createForExpectedImage(owner, projectId, { ...expected, sha256: 'f'.repeat(64) }, {
        payload: anchors(0.01), producerId: 'bers.manual-body-anchors', producerVersion: '1',
      }),
      (error: any) => error?.status === 409 && error?.code === 'body_anchor_expected_project_image_stale',
    );
    assert.equal(await countAnchors(pool, projectId), beforeStaleHash, 'stale expected source must reject before INSERT');

    const [concurrentA, concurrentB] = await Promise.all([
      new PostgresProjectBodyAnchorStore(pool).createForExpectedImage(owner, projectId, expected, {
        payload: anchors(0.015), producerId: 'bers.manual-body-anchors', producerVersion: '1',
      }),
      new PostgresProjectBodyAnchorStore(pool).createForExpectedImage(owner, projectId, expected, {
        payload: anchors(0.02), producerId: 'bers.manual-body-anchors', producerVersion: '1',
      }),
    ]);
    assert.notEqual(concurrentA.acquisitionSequence, concurrentB.acquisitionSequence);
    assert.ok(BigInt(concurrentA.acquisitionSequence) > BigInt(first.acquisitionSequence));
    assert.ok(BigInt(concurrentB.acquisitionSequence) > BigInt(first.acquisitionSequence));

    const ordered = await pool.query(`SELECT anchor_set_id,acquisition_sequence::text AS acquisition_sequence
      FROM canonical_project_body_anchor_sets
      WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_image_storage_id=$4
      ORDER BY acquisition_sequence DESC,anchor_set_id`, [projectId, owner.tenantId, owner.userId, expected.storageId]);
    assert.equal(ordered.rows.length, 3);
    const sequenceValues = ordered.rows.map(row => BigInt(String(row.acquisition_sequence)));
    assert.ok(sequenceValues[0] > sequenceValues[1] && sequenceValues[1] > sequenceValues[2]);

    const replacementStorageId = randomUUID().toLowerCase();
    const replacementBytes = await image(9);
    await pool.query(`INSERT INTO canonical_image_artifacts
      (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
      VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9)`, [
      replacementStorageId, owner.tenantId, owner.userId, projectId, randomUUID(), 'F4B6C2A_STALE_SOURCE_FIXTURE',
      expected.width, expected.height, Buffer.from(replacementBytes),
    ]);
    await pool.query(`UPDATE canonical_projects SET current_image_storage_id=$2,updated_at=CURRENT_TIMESTAMP WHERE project_id=$1`, [projectId, replacementStorageId]);

    const beforeCursorStale = await countAnchors(pool, projectId);
    await assert.rejects(
      store.createForExpectedImage(owner, projectId, expected, {
        payload: anchors(0.025), producerId: 'bers.manual-body-anchors', producerVersion: '1',
      }),
      (error: any) => error?.status === 409 && error?.code === 'body_anchor_expected_project_image_stale',
    );
    assert.equal(await countAnchors(pool, projectId), beforeCursorStale, 'historical signed source must not produce an anchor row for the new Project cursor');
  } finally {
    await pool.end();
  }
});
