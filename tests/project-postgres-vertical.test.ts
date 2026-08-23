import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createProductionCore } from '../server/core/composition/createProductionCore.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { createNodeHttpAdapter } from '../server/core/http/nodeHttpAdapter.ts';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { migrateMaskArtifactSchema } from '../server/core/artifacts/maskArtifactSchema.ts';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { CoreMaskArtifactPort } from '../src/application/selection/CoreMaskArtifactPort.js';
import { createCreativeEditApplicationService } from '../src/application/creative/CreativeEditApplicationService.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: canonical Project acceptance must use real PostgreSQL');

const jwtSecret = 'project-vertical-jwt-secret';
const tenantId = 'project-vertical-tenant';
const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'project-fal-secret',
  falBaseUrl: 'https://provider.project.test', jwtSecret, jwtIssuer: 'project-test', jwtAudience: 'project-core',
  artifactSigningSecret: 'project-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 64_000, maskUploadLimitBytes: 64_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 1_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

function token(userId: string, ownerTenant = tenantId): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: userId, tenantId: ownerTenant, iss: config.jwtIssuer, aud: config.jwtAudience, exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function wallet(pool: Pool, userId: string, balance = 20) {
  await pool.query('INSERT INTO credit_wallets (owner_id,total_credited,balance) VALUES ($1,$2,$2)', [userId, balance]);
}

function decodeClaim(value: string) {
  return JSON.parse(Buffer.from(value.split('.')[0], 'base64url').toString('utf8')) as Record<string, unknown>;
}

test('canonical Project upload persists immutable ORIGINAL and drives controlled edit from stored source', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'project-postgres-acceptance' });
  await migrateTransactionSchema(pool);
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await pool.query('TRUNCATE canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
    await pool.end();
  });

  const width = 8, height = 8;
  const originalPixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) originalPixels.set([(i * 17) % 251, (i * 23) % 253, (i * 31) % 255, 255], i * 4);
  const uploadPng = new Uint8Array(await sharp(originalPixels, { raw: { width, height, channels: 4 } }).png().toBuffer());

  const initiations: Array<{ fileUrl: string }> = [];
  const binaryUploads: Uint8Array[] = [];
  const inferences: Array<Record<string, unknown>> = [];
  let externalOriginalFetches = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.includes('assets.') || url.includes('/original')) {
      externalOriginalFetches++;
      throw new Error(`stored ORIGINAL must not cross an external fetch boundary: ${url}`);
    }
    if (url === 'https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3') {
      assert.equal(init?.method, 'POST');
      assert.equal(headers.get('authorization'), `Key ${config.falKey}`);
      const index = initiations.length;
      const fileUrl = `https://fal-cdn.project.test/input-${index}.png`;
      initiations.push({ fileUrl });
      return new Response(JSON.stringify({ upload_url: `https://upload.project.test/${index}`, file_url: fileUrl }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.startsWith('https://upload.project.test/')) {
      assert.equal(init?.method, 'PUT');
      assert.equal(headers.has('authorization'), false);
      binaryUploads.push(new Uint8Array(await new Response(init?.body).arrayBuffer()));
      return new Response('', { status: 200 });
    }
    if (url === `${config.falBaseUrl}/fal-ai/flux-pro/v1/fill`) {
      assert.equal(init?.method, 'POST');
      assert.equal(headers.get('authorization'), `Key ${config.falKey}`);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      inferences.push(body);
      const roi = await sharp(binaryUploads[0]).metadata();
      const patch = await sharp({ create: { width: roi.width!, height: roi.height!, channels: 4, background: { r: 250, g: 2, b: 3, alpha: 1 } } }).png().toBuffer();
      return new Response(JSON.stringify({ images: [{ url: 'https://fal.media/patch.png' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === 'https://fal.media/patch.png') {
      const roi = await sharp(binaryUploads[0]).metadata();
      const patch = await sharp({ create: { width: roi.width!, height: roi.height!, channels: 4, background: { r: 250, g: 2, b: 3, alpha: 1 } } }).png().toBuffer();
      return new Response(patch, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    throw new Error(`Unexpected external HTTP boundary: ${url}`);
  };

  const production = await createProductionCore(config, { fetcher });
  const server = createServer(createNodeHttpAdapter({ core: production.core, artifacts: production.artifacts, projects: production.projects, auth: production.auth, config, ready: async () => true, accepting: () => true }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await closeServer(server); await production.close(); });

  const userId = 'project-user';
  await wallet(pool, userId);
  const auth = `Bearer ${token(userId)}`;

  const create = await fetch(`${baseUrl}/api/core/projects?name=Canonical%20Project`, { method: 'POST', headers: { authorization: auth, 'content-type': 'image/png' }, body: uploadPng });
  assert.equal(create.status, 201);
  const project = await create.json() as Record<string, any>;
  assert.equal(project.name, 'Canonical Project');
  assert.deepEqual([project.width, project.height], [width, height]);
  assert.equal(project.original_image_artifact_id, project.current_image_artifact_id);
  assert.equal(decodeClaim(project.current_image_artifact_id).location, 'STORED_ORIGINAL_ID');

  const projectRows = await pool.query('SELECT * FROM canonical_projects WHERE project_id=$1', [project.id]);
  assert.equal(projectRows.rowCount, 1);
  const projectRow = projectRows.rows[0];
  assert.equal(projectRow.original_image_storage_id, projectRow.current_image_storage_id);
  const originalRows = await pool.query("SELECT * FROM canonical_image_artifacts WHERE project_id=$1 AND role='ORIGINAL' AND deleted_at IS NULL", [project.id]);
  assert.equal(originalRows.rowCount, 1);
  const originalRow = originalRows.rows[0];
  assert.equal(originalRow.lifecycle, 'IMMUTABLE');
  assert.equal(originalRow.encoding, 'PNG_RGBA8_LOSSLESS');
  assert.equal(originalRow.content_type, 'image/png');
  assert.equal(originalRow.execution_id, null); assert.equal(originalRow.operation_id, null);
  const canonical = await sharp(originalRow.image_bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([canonical.info.width, canonical.info.height, canonical.info.channels], [width, height, 4]);

  const list = await fetch(`${baseUrl}/api/core/projects`, { headers: { authorization: auth } });
  assert.equal(list.status, 200); assert.equal((await list.json() as unknown[]).length, 1);
  const get1 = await fetch(`${baseUrl}/api/core/projects/${project.id}`, { headers: { authorization: auth } });
  assert.equal(get1.status, 200);
  const reloaded = await get1.json() as Record<string, any>;
  assert.equal(reloaded.current_image_artifact_id, project.current_image_artifact_id);
  const deliveredOriginal = await fetch(`${baseUrl}${reloaded.current_image_url}`);
  assert.equal(deliveredOriginal.status, 200); assert.equal(deliveredOriginal.headers.get('content-type'), 'image/png');

  const stableDelivery = await fetch(`${baseUrl}/api/core/artifacts/results/${encodeURIComponent(project.current_image_artifact_id)}`);
  assert.notEqual(stableDelivery.status, 200, 'stable ORIGINAL identity must not be a delivery credential');

  const alpha = new Uint8Array(width * height);
  for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]]) alpha[y * width + x] = 255;
  const httpClient = {
    artifacts: {
      persistMask: async ({ projectId, width, height, alpha }: { projectId: string; width: number; height: number; alpha: Uint8Array }) => {
        const response = await fetch(`${baseUrl}/api/core/artifacts/masks?projectId=${encodeURIComponent(projectId)}&width=${width}&height=${height}`, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/octet-stream' }, body: alpha });
        assert.equal(response.status, 201); return response.json();
      },
    },
    creative: {
      execute: async (body: Record<string, unknown>) => {
        const response = await fetch(`${baseUrl}/api/core/creative/execute`, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
        assert.equal(response.status, 200); return response.json();
      },
      cancel: async () => { throw new Error('not used'); },
      status: async () => { throw new Error('not used'); },
    },
  };
  const maskPort = new CoreMaskArtifactPort(project.id, httpClient as any);
  const persistedMask = await maskPort.persist({ width, height, alpha, source: 'USER', coordinateSpace: 'ORIGINAL' }, { coordinateSpace: 'ORIGINAL', encoding: 'ALPHA_8_LOSSLESS' });
  assert.equal(decodeClaim(persistedMask.id).location, 'STORED_MASK');

  const objects = [{ id: 'selected-object', label: 'Selection', selected: true, mask_artifact_id: persistedMask.id }];
  const patchProject = await fetch(`${baseUrl}/api/core/projects/${project.id}`, { method: 'PATCH', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ objects }) });
  assert.equal(patchProject.status, 200);
  const persistedObjects = (await patchProject.json() as Record<string, any>).objects;
  assert.equal(persistedObjects[0].mask_artifact_id, persistedMask.id);
  const get2 = await fetch(`${baseUrl}/api/core/projects/${project.id}`, { headers: { authorization: auth } });
  assert.equal((await get2.json() as Record<string, any>).objects[0].mask_artifact_id, persistedMask.id);

  const editor = createCreativeEditApplicationService(httpClient as any);
  const result = await editor.execute({ projectId: project.id, instruction: 'replace only the selected pixels', selectedObjectIds: ['selected-object'], inputArtifactId: project.current_image_artifact_id, maskArtifactIds: [persistedMask.id], preserveMode: 'STRICT', clientRequestId: 'project-controlled-1' });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.verification?.valid, true);
  assert.equal(externalOriginalFetches, 0, 'stored ORIGINAL must hydrate directly from PostgreSQL');
  assert.equal(initiations.length, 2); assert.equal(binaryUploads.length, 2); assert.equal(inferences.length, 1);
  assert.equal(inferences[0].image_url, initiations[0].fileUrl); assert.equal(inferences[0].mask_url, initiations[1].fileUrl);
  const finalClaim = decodeClaim(String(result.finalArtifactId));
  assert.equal(finalClaim.location, 'STORED_FINAL_ID');
  const finalRow = (await pool.query('SELECT * FROM canonical_image_artifacts WHERE storage_id=$1', [finalClaim.storageId])).rows[0];
  assert.equal(finalRow.role, 'COMPOSITE'); assert.equal(finalRow.lifecycle, 'FINAL'); assert.equal(finalRow.project_id, project.id);
  const canonicalOutcome = production.core.service.result(String(result.executionId), { tenantId, userId });
  const composite = canonicalOutcome?.artifacts.find(item => item.role === 'COMPOSITE');
  assert.equal((composite?.metadata?.integrityMetrics as { outsideChangedPixelRatio?: number })?.outsideChangedPixelRatio, 0);

  const wrongUser = await fetch(`${baseUrl}/api/core/projects/${project.id}`, { headers: { authorization: `Bearer ${token('other-user')}` } });
  assert.equal(wrongUser.status, 404);
  const wrongTenant = await fetch(`${baseUrl}/api/core/projects/${project.id}`, { headers: { authorization: `Bearer ${token(userId, 'other-tenant')}` } });
  assert.equal(wrongTenant.status, 404);

  const deniedPatch = await fetch(`${baseUrl}/api/core/projects/${project.id}`, { method: 'PATCH', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ current_image_storage_id: originalRow.storage_id }) });
  assert.equal(deniedPatch.status, 400);

  const beforeInvalidProjects = Number((await pool.query('SELECT count(*)::int AS count FROM canonical_projects')).rows[0].count);
  const beforeInvalidOriginals = Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE role='ORIGINAL' AND deleted_at IS NULL")).rows[0].count);
  const invalid = await fetch(`${baseUrl}/api/core/projects?name=Broken`, { method: 'POST', headers: { authorization: auth, 'content-type': 'image/png' }, body: new Uint8Array([1, 2, 3, 4]) });
  assert.equal(invalid.status, 400);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM canonical_projects')).rows[0].count), beforeInvalidProjects);
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE role='ORIGINAL' AND deleted_at IS NULL")).rows[0].count), beforeInvalidOriginals);

  const remove = await fetch(`${baseUrl}/api/core/projects/${project.id}`, { method: 'DELETE', headers: { authorization: auth } });
  assert.equal(remove.status, 204);
  const deletedGet = await fetch(`${baseUrl}/api/core/projects/${project.id}`, { headers: { authorization: auth } }); assert.equal(deletedGet.status, 404);
  const deletedDelivery = await fetch(`${baseUrl}${reloaded.original_image_url}`); assert.notEqual(deletedDelivery.status, 200);
  assert.equal(await production.artifacts.images.loadSource(originalRow.storage_id, { tenantId, userId, projectId: project.id }), undefined);
});