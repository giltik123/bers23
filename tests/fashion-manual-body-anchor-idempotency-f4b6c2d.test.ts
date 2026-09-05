import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import type { CoreServerConfig } from '../server/core/config.ts';
import { migrateProjectBodyAnchorSchema } from '../server/core/fashion/bodyAnchorSchema.ts';
import { ManualProjectBodyAnchorAcquisitionService } from '../server/core/fashion/ManualProjectBodyAnchorAcquisitionService.ts';
import { PostgresProjectBodyAnchorStore } from '../server/core/fashion/postgresProjectBodyAnchorStore.ts';
import { createManualProjectBodyAnchorHttpAdapter } from '../server/core/http/manualProjectBodyAnchorHttpAdapter.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for manual body-anchor idempotency acceptance');

const owner = Object.freeze({ tenantId: 'f4b6c2d-idem-tenant', userId: 'f4b6c2d-idem-user' });
const bearerHeaders = Object.freeze({ Authorization: 'Bearer test.token.value', 'Content-Type': 'application/json' });
const projectLimits = Object.freeze({ maxDimension: 1200, maxPixels: 1_500_000 });
const config = {
  nodeEnv: 'test',
  allowedWebOrigins: Object.freeze(['http://app.test']),
  bodyLimitBytes: 16384,
  authChallengeSecret: 'f4b6c2d-idempotency-secret',
  authPublicOrigin: 'http://localhost',
  allowApiBearerAuth: true,
} as unknown as CoreServerConfig;

const KEY_EXACT = '11111111-1111-4111-8111-111111111111';
const KEY_CONCURRENT = '22222222-2222-4222-8222-222222222222';
const KEY_STALE = '33333333-3333-4333-8333-333333333333';
const KEY_ORPHAN = '44444444-4444-4444-8444-444444444444';

function anchors(offset = 0) {
  return Object.freeze({
    schemaVersion: 1,
    coordinateSpace: 'PROJECT_IMAGE_NORMALIZED',
    anchors: Object.freeze({
      leftShoulder: Object.freeze([0.2 + offset, 0.15] as const),
      rightShoulder: Object.freeze([0.8 - offset, 0.15] as const),
      leftHip: Object.freeze([0.28 + offset, 0.75] as const),
      rightHip: Object.freeze([0.72 - offset, 0.75] as const),
    }),
  });
}

async function image(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 120, height: 160, channels: 4, background: { r: 30 + seed, g: 80 + seed, b: 140 + seed, alpha: 1 } },
  }).png().toBuffer());
}

async function currentEvidence(pool: Pool, projectId: string, artifactId: string) {
  const result = await pool.query(`SELECT a.storage_id,a.width,a.height,a.image_bytes,a.role,a.lifecycle
    FROM canonical_projects p
    JOIN canonical_image_artifacts a
      ON a.storage_id=p.current_image_storage_id
     AND a.tenant_id=p.tenant_id AND a.user_id=p.user_id AND a.project_id=p.project_id::text
    WHERE p.project_id=$1 AND p.tenant_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL`,
  [projectId, owner.tenantId, owner.userId]);
  const row = result.rows[0];
  if (!row) throw new Error('Current Project evidence fixture is unavailable');
  return Object.freeze({
    artifactId,
    projectId,
    storageId: String(row.storage_id).toLowerCase(),
    role: String(row.role),
    lifecycle: String(row.lifecycle),
    width: Number(row.width),
    height: Number(row.height),
    sha256: createHash('sha256').update(new Uint8Array(row.image_bytes)).digest('hex'),
  });
}

async function countAnchors(pool: Pool, projectId?: string): Promise<number> {
  const params = [owner.tenantId, owner.userId];
  const projectClause = projectId ? ' AND project_id=$3' : '';
  if (projectId) params.push(projectId);
  const result = await pool.query(`SELECT count(*)::int AS count FROM canonical_project_body_anchor_sets
    WHERE tenant_id=$1 AND user_id=$2${projectClause}`, params);
  return Number(result.rows[0]?.count);
}

async function idempotentRow(pool: Pool, key: string) {
  const result = await pool.query(`SELECT anchor_set_id,project_id,project_image_storage_id,project_image_sha256,
      anchor_payload_sha256,acquisition_sequence::text AS acquisition_sequence,idempotency_binding_sha256
    FROM canonical_project_body_anchor_sets
    WHERE tenant_id=$1 AND user_id=$2 AND idempotency_key=$3`, [owner.tenantId, owner.userId, key]);
  return result.rows[0];
}

async function withServer(service: ManualProjectBodyAnchorAcquisitionService, run: (base: string) => Promise<void>) {
  const adapter = createManualProjectBodyAnchorHttpAdapter({
    acquisition: service,
    auth: {
      verify: async authorization => {
        if (authorization !== bearerHeaders.Authorization) throw Object.assign(new Error('Authentication required'), { status: 401, code: 'unauthorized' });
        return owner as any;
      },
    },
    config,
    accepting: () => true,
  });
  const server = createServer((request, response) => { void adapter(request, response); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address unavailable');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function post(base: string, projectId: string, sourceArtifactId: string, idempotencyKey: string, payload: unknown) {
  return fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
    method: 'POST',
    headers: bearerHeaders,
    body: JSON.stringify({ sourceArtifactId, payload, idempotencyKey }),
  });
}

async function replaceProjectImage(pool: Pool, projectId: string, width: number, height: number) {
  const storageId = randomUUID().toLowerCase();
  const bytes = await image(19);
  await pool.query(`INSERT INTO canonical_image_artifacts
    (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
    VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9)`, [
    storageId, owner.tenantId, owner.userId, projectId, randomUUID(), 'F4B6C2D_STALE_SOURCE_FIXTURE',
    width, height, Buffer.from(bytes),
  ]);
  await pool.query(`UPDATE canonical_projects
    SET current_image_storage_id=$2,updated_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$3 AND user_id=$4`,
  [projectId, storageId, owner.tenantId, owner.userId]);
}

test('F4b.6c.2d HTTP + PostgreSQL manual body-anchor acquisition is exactly-once for one opaque Save intent', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8, application_name: 'bers-f4b6c2d-body-anchor-idempotency' });
  try {
    await migrateProjectBodyAnchorSchema(pool);
    const projects = new PostgresProjectStore(pool);
    const firstProject = await projects.create(owner, 'F4b.6c.2d first Project', await image(1), projectLimits);
    const secondProject = await projects.create(owner, 'F4b.6c.2d second Project', await image(2), projectLimits);
    const projectA = String(firstProject.project_id).toLowerCase();
    const projectB = String(secondProject.project_id).toLowerCase();
    const sourceA = await currentEvidence(pool, projectA, 'source-a');
    const sourceB = await currentEvidence(pool, projectB, 'source-b');
    const sources = new Map([
      ['source-a', sourceA],
      ['source-a-alias', Object.freeze({ ...sourceA, artifactId: 'source-a-alias' })],
      ['source-b', sourceB],
      ['source-a-stale', Object.freeze({ ...sourceA, artifactId: 'source-a-stale' })],
    ]);

    const service = new ManualProjectBodyAnchorAcquisitionService({
      artifacts: {
        resolveStoredImageEvidence: async (scope: any, artifactId: string) => {
          const source = sources.get(artifactId);
          if (!source || source.projectId !== scope.projectId) throw new Error('test source unavailable');
          return source as any;
        },
      },
      bodyAnchors: new PostgresProjectBodyAnchorStore(pool),
    });

    await withServer(service, async base => {
      const before = await countAnchors(pool);
      const first = await post(base, projectA, 'source-a', KEY_EXACT, anchors());
      const replay = await post(base, projectA, 'source-a', KEY_EXACT, anchors());
      assert.equal(first.status, 201);
      assert.equal(replay.status, 201);
      const firstBody = await first.json() as any;
      const replayBody = await replay.json() as any;
      assert.deepEqual(replayBody, firstBody);
      assert.equal(await countAnchors(pool), before + 1, 'exact replay must not persist a second immutable anchor set');

      const exactRow = await idempotentRow(pool, KEY_EXACT);
      assert.ok(exactRow);
      assert.deepEqual(Object.keys(firstBody).sort(), ['anchorSet', 'projectId', 'sourceArtifactId']);
      assert.deepEqual(Object.keys(firstBody.anchorSet ?? {}).sort(), ['coordinateSpace', 'schemaId']);
      const publicSerialized = JSON.stringify(firstBody);
      for (const field of [
        'anchorSetId',
        'projectImageStorageId',
        'projectImageSha256',
        'payloadSha256',
        'acquisitionSequence',
        'idempotencyKey',
        'idempotencyBindingSha256',
      ]) assert.equal(publicSerialized.includes(`"${field}"`), false, `public acknowledgement exposed private field ${field}`);
      for (const secret of [
        KEY_EXACT,
        String(exactRow.anchor_set_id),
        String(exactRow.project_image_storage_id),
        String(exactRow.project_image_sha256),
        String(exactRow.anchor_payload_sha256),
        String(exactRow.idempotency_binding_sha256),
      ]) assert.equal(publicSerialized.includes(secret), false, `public acknowledgement leaked high-entropy private value ${secret}`);

      await assert.rejects(
        pool.query(`INSERT INTO canonical_project_body_anchor_sets
          (anchor_set_id,tenant_id,user_id,project_id,project_image_storage_id,project_image_sha256,project_image_width,project_image_height,
           schema_id,coordinate_space,anchor_payload,anchor_payload_sha256,producer_id,producer_version,idempotency_key,idempotency_binding_sha256)
          SELECT $1,tenant_id,user_id,project_id,project_image_storage_id,project_image_sha256,project_image_width,project_image_height,
                 schema_id,coordinate_space,anchor_payload,anchor_payload_sha256,producer_id,producer_version,$2,NULL
          FROM canonical_project_body_anchor_sets
          WHERE tenant_id=$3 AND user_id=$4 AND idempotency_key=$5`, [
          randomUUID(), KEY_ORPHAN, owner.tenantId, owner.userId, KEY_EXACT,
        ]),
        (error: any) => error?.code === '23514' && error?.constraint === 'canonical_project_body_anchor_sets_idempotency_binding_check',
        'PostgreSQL must reject a non-null idempotency key without its private binding hash',
      );
      assert.equal(await idempotentRow(pool, KEY_ORPHAN), undefined, 'orphan idempotency key must never reach durable evidence');

      const beforeConcurrent = await countAnchors(pool);
      const [concurrentA, concurrentB] = await Promise.all([
        post(base, projectA, 'source-a', KEY_CONCURRENT, anchors(0.01)),
        post(base, projectA, 'source-a', KEY_CONCURRENT, anchors(0.01)),
      ]);
      assert.equal(concurrentA.status, 201);
      assert.equal(concurrentB.status, 201);
      assert.equal(await countAnchors(pool), beforeConcurrent + 1, 'concurrent duplicate must linearize to one INSERT');

      const beforeConflict = await countAnchors(pool);
      const payloadConflict = await post(base, projectA, 'source-a', KEY_CONCURRENT, anchors(0.02));
      assert.equal(payloadConflict.status, 409);
      assert.equal((await payloadConflict.json() as any).error, 'body_anchor_idempotency_conflict');

      const sourceConflict = await post(base, projectA, 'source-a-alias', KEY_CONCURRENT, anchors(0.01));
      assert.equal(sourceConflict.status, 409);
      assert.equal((await sourceConflict.json() as any).error, 'body_anchor_idempotency_conflict');

      const projectConflict = await post(base, projectB, 'source-b', KEY_CONCURRENT, anchors(0.01));
      assert.equal(projectConflict.status, 409);
      assert.equal((await projectConflict.json() as any).error, 'body_anchor_idempotency_conflict');
      assert.equal(await countAnchors(pool), beforeConflict, 'key-reuse conflicts must not persist evidence');

      const missingKey = await fetch(`${base}/api/core/fashion/projects/${projectA}/body-anchors`, {
        method: 'POST', headers: bearerHeaders, body: JSON.stringify({ sourceArtifactId: 'source-a', payload: anchors() }),
      });
      assert.equal(missingKey.status, 400);
      assert.equal((await missingKey.json() as any).error, 'forbidden_client_authority');

      const invalidKey = await post(base, projectA, 'source-a', 'not-a-uuid', anchors());
      assert.equal(invalidKey.status, 400);
      assert.equal((await invalidKey.json() as any).error, 'invalid_manual_body_anchor_request');

      const beforeStale = await countAnchors(pool, projectA);
      await replaceProjectImage(pool, projectA, sourceA.width, sourceA.height);

      const committedReplayAfterAdvance = await post(base, projectA, 'source-a', KEY_EXACT, anchors());
      assert.equal(committedReplayAfterAdvance.status, 201, 'already committed exact replay must not depend on the Project still pointing at the old image');
      assert.deepEqual(await committedReplayAfterAdvance.json(), firstBody, 'lost-ACK replay must return the original stable public acknowledgement after Project advance');
      assert.equal(await countAnchors(pool, projectA), beforeStale, 'committed replay after Project advance must not INSERT another evidence row');

      const stale = await post(base, projectA, 'source-a-stale', KEY_STALE, anchors(0.03));
      assert.equal(stale.status, 409);
      assert.equal((await stale.json() as any).error, 'body_anchor_expected_project_image_stale');
      assert.equal(await countAnchors(pool, projectA), beforeStale, 'new intent on a stale canonical Project source must reject before INSERT');
    });
  } finally {
    await pool.end();
  }
});
