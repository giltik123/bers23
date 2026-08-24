import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import { ArtifactAuthority } from './artifactAuthority.ts';
import { checkMaskArtifactSchema, migrateMaskArtifactSchema } from './maskArtifactSchema.ts';
import { PostgresImageArtifactStore } from './postgresImageArtifactStore.ts';
import { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';
import { createMaskArtifactHttpAdapter } from '../http/maskArtifactHttpAdapter.ts';

const databaseUrl = process.env.DATABASE_URL;

const config = Object.freeze({
  nodeEnv: 'test',
  allowedWebOrigins: Object.freeze([]),
  allowApiBearerAuth: true,
  authPublicOrigin: 'http://localhost',
  authChallengeSecret: 'c1-mask-lineage-csrf-secret',
  maskMaxDimension: 64,
  maskUploadLimitBytes: 64 * 64,
});

function rgba(width, height, value = 64) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(value) };
}

async function startAdapter(artifacts, scope) {
  const auth = {
    verify(authorization) {
      if (authorization !== 'Bearer valid') throw Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated' });
      return Object.freeze({ tenantId: scope.tenantId, userId: scope.userId });
    },
  };
  const adapter = createMaskArtifactHttpAdapter({ artifacts, auth, config });
  const server = createServer((request, response) => { void adapter(request, response); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

async function postMask(baseUrl, { projectId, sourceImageArtifactId, parentMaskArtifactId, width, height, alpha, extra = {}, authorization = 'Bearer valid' }) {
  const query = new URLSearchParams({
    projectId,
    sourceImageArtifactId,
    width: String(width),
    height: String(height),
    ...extra,
  });
  if (parentMaskArtifactId) query.set('parentMaskArtifactId', parentMaskArtifactId);
  const response = await fetch(`${baseUrl}/api/core/artifacts/masks?${query}`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/octet-stream' },
    body: alpha,
  });
  return { response, body: await response.json() };
}

function corrupt(reference) {
  const last = reference.at(-1);
  return `${reference.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`;
}

test('C1 real PostgreSQL + HTTP enforces canonical MASK lineage and geometry', { skip: !databaseUrl }, async () => {
  const admin = new Pool({ connectionString: databaseUrl, max: 1, application_name: 'bers-c1-mask-lineage-admin' });
  const schema = `c1_mask_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: 'bers-c1-mask-lineage' });
  await pool.query(`SET search_path TO ${schema}`);
  let runtime;
  try {
    // Fresh install proof: the MASK migrator must create 002, ensure image schema 003,
    // then apply lineage 014 without relying on external caller ordering.
    await migrateMaskArtifactSchema(pool);
    await checkMaskArtifactSchema(pool);
    const tables = await pool.query("SELECT to_regclass('canonical_mask_artifacts')::text AS masks, to_regclass('canonical_image_artifacts')::text AS images");
    assert.equal(tables.rows[0].masks, 'canonical_mask_artifacts');
    assert.equal(tables.rows[0].images, 'canonical_image_artifacts');

    const images = new PostgresImageArtifactStore(pool);
    const masks = new PostgresMaskArtifactStore(pool);
    const signing = new SignedArtifactAuthority('c1-artifact-signing-secret', []);
    const artifacts = new ArtifactAuthority(signing, masks, images);
    const scope = Object.freeze({ tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' });
    const otherScope = Object.freeze({ ...scope, projectId: 'project-b' });

    const source = await images.persistFinal(scope, 'source-execution', 'source-operation', rgba(4, 4));
    const sourceId = signing.issueStoredFinal(source.storageId, scope);
    const otherSource = await images.persistFinal(otherScope, 'other-source-execution', 'source-operation', rgba(4, 4));
    const otherSourceId = signing.issueStoredFinal(otherSource.storageId, otherScope);
    const smallSource = await images.persistFinal(scope, 'small-source-execution', 'source-operation', rgba(2, 2));

    const parent = await masks.persistManual(scope, 4, 4, new Uint8Array(16).fill(255), {
      sourceImageStorageId: source.storageId,
      producerOperation: 'MANUAL_SELECTION',
    });
    const parentId = signing.issueStoredMask(parent.storageId, scope);
    const otherParent = await masks.persistManual(otherScope, 4, 4, new Uint8Array(16).fill(200), {
      sourceImageStorageId: otherSource.storageId,
      producerOperation: 'MANUAL_SELECTION',
    });
    const otherParentId = signing.issueStoredMask(otherParent.storageId, otherScope);
    const smallParent = await masks.persistManual(scope, 2, 2, new Uint8Array(4).fill(180), {
      sourceImageStorageId: smallSource.storageId,
      producerOperation: 'MANUAL_SELECTION',
    });
    const smallParentId = signing.issueStoredMask(smallParent.storageId, scope);

    runtime = await startAdapter(artifacts, scope);
    const alpha = new Uint8Array(16).fill(128);

    const manual = await postMask(runtime.url, {
      projectId: scope.projectId,
      sourceImageArtifactId: sourceId,
      width: 4,
      height: 4,
      alpha,
      extra: { producerOperation: 'CLIENT_FORGED', storageId: '00000000-0000-0000-0000-000000000000' },
    });
    assert.equal(manual.response.status, 201);
    assert.equal(manual.body.producerOperation, 'MANUAL_SELECTION');
    const manualClaim = signing.resolveStoredMask(manual.body.artifactId, scope);
    assert.notEqual(manualClaim.storageId, '00000000-0000-0000-0000-000000000000');
    const manualStored = await masks.load(manualClaim.storageId, scope);
    assert.equal(manualStored.sourceImageStorageId, source.storageId);
    assert.equal(manualStored.parentMaskStorageId, undefined);
    assert.equal(manualStored.producerOperation, 'MANUAL_SELECTION');

    const refined = await postMask(runtime.url, {
      projectId: scope.projectId,
      sourceImageArtifactId: sourceId,
      parentMaskArtifactId: parentId,
      width: 4,
      height: 4,
      alpha,
    });
    assert.equal(refined.response.status, 201);
    assert.equal(refined.body.producerOperation, 'MASK_REFINEMENT');
    const refinedClaim = signing.resolveStoredMask(refined.body.artifactId, scope);
    const refinedStored = await masks.load(refinedClaim.storageId, scope);
    assert.equal(refinedStored.sourceImageStorageId, source.storageId);
    assert.equal(refinedStored.parentMaskStorageId, parent.storageId);
    assert.equal(refinedStored.producerOperation, 'MASK_REFINEMENT');

    const beforeRejected = Number((await pool.query("SELECT count(*) AS count FROM canonical_mask_artifacts WHERE project_id=$1", [scope.projectId])).rows[0].count);
    const rejected = [
      await postMask(runtime.url, { projectId: scope.projectId, sourceImageArtifactId: corrupt(sourceId), width: 4, height: 4, alpha }),
      await postMask(runtime.url, { projectId: scope.projectId, sourceImageArtifactId: otherSourceId, width: 4, height: 4, alpha }),
      await postMask(runtime.url, { projectId: scope.projectId, sourceImageArtifactId: sourceId, parentMaskArtifactId: corrupt(parentId), width: 4, height: 4, alpha }),
      await postMask(runtime.url, { projectId: scope.projectId, sourceImageArtifactId: sourceId, parentMaskArtifactId: otherParentId, width: 4, height: 4, alpha }),
    ];
    assert.deepEqual(rejected.map(item => item.response.status), [400, 400, 400, 400]);

    const sourceMismatch = await postMask(runtime.url, { projectId: scope.projectId, sourceImageArtifactId: sourceId, width: 2, height: 2, alpha: new Uint8Array(4) });
    assert.equal(sourceMismatch.response.status, 409);
    assert.equal(sourceMismatch.body.error, 'source_geometry_mismatch');
    const parentMismatch = await postMask(runtime.url, { projectId: scope.projectId, sourceImageArtifactId: sourceId, parentMaskArtifactId: smallParentId, width: 4, height: 4, alpha });
    assert.equal(parentMismatch.response.status, 409);
    assert.equal(parentMismatch.body.error, 'parent_mask_geometry_mismatch');

    const unauthorized = await postMask(runtime.url, { projectId: scope.projectId, sourceImageArtifactId: sourceId, width: 4, height: 4, alpha, authorization: 'Bearer invalid' });
    assert.equal(unauthorized.response.status, 401);
    const afterRejected = Number((await pool.query("SELECT count(*) AS count FROM canonical_mask_artifacts WHERE project_id=$1", [scope.projectId])).rows[0].count);
    assert.equal(afterRejected, beforeRejected, 'rejected lineage/geometry/auth requests must not insert canonical MASK rows');
  } finally {
    if (runtime) await runtime.close();
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
