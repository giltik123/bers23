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
if (!databaseUrl) throw new Error('DATABASE_URL is required: Project history acceptance must use real PostgreSQL');

const jwtSecret = 'project-history-jwt-secret';
const tenantId = 'project-history-tenant';
const userId = 'project-history-user';
const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'project-history-fal-secret',
  falBaseUrl: 'https://provider.history.test', jwtSecret, jwtIssuer: 'history-test', jwtAudience: 'history-core',
  artifactSigningSecret: 'project-history-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 64_000, maskUploadLimitBytes: 64_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 1_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

function token(subject: string, ownerTenant = tenantId): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: subject, tenantId: ownerTenant, iss: config.jwtIssuer, aud: config.jwtAudience, exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function decodeClaim(value: string) {
  return JSON.parse(Buffer.from(value.split('.')[0], 'base64url').toString('utf8')) as Record<string, any>;
}

async function closeServer(server?: Server) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function reservations(pool: Pool) {
  return Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations WHERE owner_id=$1', [userId])).rows[0].count);
}

async function historyCount(pool: Pool, projectId: string) {
  return Number((await pool.query('SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND retired_at IS NULL', [projectId])).rows[0].count);
}

async function startProduction(fetcher: typeof fetch) {
  const production = await createProductionCore(config, { fetcher });
  const server = createServer(createNodeHttpAdapter({ core: production.core, artifacts: production.artifacts, projects: production.projects, auth: production.auth, config, ready: async () => true, accepting: () => true }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address === 'object');
  return { production, server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test('accepted FINAL history, navigation, versions and restart remain server-authoritative', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'project-history-postgres-acceptance' });
  await migrateTransactionSchema(pool);
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await pool.query('TRUNCATE canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  await pool.query('INSERT INTO credit_wallets (owner_id,total_credited,balance) VALUES ($1,20,20)', [userId]);

  let live: Awaited<ReturnType<typeof startProduction>> | undefined;
  t.after(async () => {
    if (live) { await closeServer(live.server); await live.production.close(); }
    await pool.query('TRUNCATE canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
    await pool.end();
  });

  const width = 8, height = 8;
  const originalPixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) originalPixels.set([(i * 13) % 251, (i * 29) % 253, (i * 37) % 255, 255], i * 4);
  const uploadPng = new Uint8Array(await sharp(originalPixels, { raw: { width, height, channels: 4 } }).png().toBuffer());

  const initiations: Array<{ fileUrl: string }> = [];
  const binaryUploads: Uint8Array[] = [];
  const inferences: Array<Record<string, unknown>> = [];
  let externalSourceFetches = 0;
  const color = (generation: number) => generation === 1 ? { r: 250, g: 2, b: 3, alpha: 1 } : generation === 2 ? { r: 4, g: 240, b: 5, alpha: 1 } : { r: 6, g: 7, b: 245, alpha: 1 };

  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.includes('assets.') || url.includes('/original') || url.includes('/source-image')) {
      externalSourceFetches++;
      throw new Error(`stored Project sources must not cross an external fetch boundary: ${url}`);
    }
    if (url === 'https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3') {
      assert.equal(init?.method, 'POST');
      assert.equal(headers.get('authorization'), `Key ${config.falKey}`);
      const index = initiations.length;
      const fileUrl = `https://fal-cdn.history.test/input-${index}.png`;
      initiations.push({ fileUrl });
      return new Response(JSON.stringify({ upload_url: `https://upload.history.test/${index}`, file_url: fileUrl }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.startsWith('https://upload.history.test/')) {
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
      const generation = inferences.length;
      const roi = await sharp(binaryUploads[(generation - 1) * 2]).metadata();
      assert.equal(body.image_url, initiations[(generation - 1) * 2].fileUrl);
      assert.equal(body.mask_url, initiations[(generation - 1) * 2 + 1].fileUrl);
      const patch = await sharp({ create: { width: roi.width!, height: roi.height!, channels: 4, background: color(generation) } }).png().toBuffer();
      return new Response(JSON.stringify({ images: [{ url: `https://provider-output.history.test/patch-${generation}.png` }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.startsWith('https://provider-output.history.test/patch-')) {
      const generation = Number(url.match(/patch-(\d+)\.png$/)?.[1]);
      assert.ok(generation >= 1 && generation <= 3);
      const roi = await sharp(binaryUploads[(generation - 1) * 2]).metadata();
      const patch = await sharp({ create: { width: roi.width!, height: roi.height!, channels: 4, background: color(generation) } }).png().toBuffer();
      return new Response(patch, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    throw new Error(`Unexpected external HTTP boundary: ${url}`);
  };

  live = await startProduction(fetcher);
  let { baseUrl } = live;
  const auth = `Bearer ${token(userId)}`;
  const jsonHeaders = { authorization: auth, 'content-type': 'application/json' };

  const create = await fetch(`${baseUrl}/api/core/projects?name=History%20Project`, { method: 'POST', headers: { authorization: auth, 'content-type': 'image/png' }, body: uploadPng });
  assert.equal(create.status, 201);
  let project = await create.json() as Record<string, any>;
  const projectId = project.id as string;
  const originalArtifactId = project.current_image_artifact_id as string;
  const originalStorageId = decodeClaim(originalArtifactId).storageId as string;
  assert.equal(decodeClaim(originalArtifactId).location, 'STORED_ORIGINAL_ID');
  assert.equal(project.history_index, 0);

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
        const response = await fetch(`${baseUrl}/api/core/creative/execute`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) });
        assert.equal(response.status, 200); return response.json();
      },
      cancel: async () => { throw new Error('not used'); },
      status: async () => { throw new Error('not used'); },
    },
  };
  const maskPort = new CoreMaskArtifactPort(projectId, httpClient as any);
  const persistedMask = await maskPort.persist({ width, height, alpha, source: 'USER', coordinateSpace: 'ORIGINAL' }, { coordinateSpace: 'ORIGINAL', encoding: 'ALPHA_8_LOSSLESS' });
  const editor = createCreativeEditApplicationService(httpClient as any);

  const execute = async (inputArtifactId: string, requestId: string) => editor.execute({ projectId, instruction: `controlled history edit ${requestId}`, selectedObjectIds: ['selected-object'], inputArtifactId, maskArtifactIds: [persistedMask.id], preserveMode: 'STRICT', clientRequestId: requestId });
  const accept = (finalArtifactId: string, instruction: string) => fetch(`${baseUrl}/api/core/projects/${projectId}/accept-final`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ finalArtifactId, instruction }) });
  const mutate = async (action: string, body?: unknown) => fetch(`${baseUrl}/api/core/projects/${projectId}/${action}`, { method: 'POST', headers: jsonHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
  const reload = async () => {
    const response = await fetch(`${baseUrl}/api/core/projects/${projectId}`, { headers: { authorization: auth } }); assert.equal(response.status, 200); return response.json() as Promise<Record<string, any>>;
  };

  // Generate FINAL #1, but the Project must remain on immutable ORIGINAL until explicit acceptance.
  const result1 = await execute(originalArtifactId, 'history-edit-1');
  assert.equal(result1.status, 'SUCCESS'); assert.equal(result1.verification?.valid, true);
  const final1 = String(result1.finalArtifactId); const final1Storage = decodeClaim(final1).storageId as string;
  project = await reload();
  assert.equal(decodeClaim(project.current_image_artifact_id).storageId, originalStorageId);
  assert.equal(project.history_index, 0);
  assert.equal(inferences.length, 1); assert.equal(initiations.length, 2); assert.equal(binaryUploads.length, 2); assert.equal(externalSourceFetches, 0);
  assert.equal(await reservations(pool), 1);

  // Concurrent duplicate acceptance serializes on the Project row and advances exactly once.
  const [accept1a, accept1b] = await Promise.all([accept(final1, 'accept final one'), accept(final1, 'accept final one')]);
  assert.equal(accept1a.status, 200); assert.equal(accept1b.status, 200);
  project = await reload();
  assert.equal(decodeClaim(project.current_image_artifact_id).storageId, final1Storage);
  assert.equal(project.history_index, 1); assert.equal(await historyCount(pool, projectId), 2);
  assert.equal(await reservations(pool), 1); assert.equal(inferences.length, 1);
  const accepted1 = (await pool.query("SELECT * FROM canonical_project_history WHERE project_id=$1 AND kind='ACCEPTED_FINAL' AND image_storage_id=$2", [projectId, final1Storage])).rows[0];
  assert.equal(accepted1.execution_id, result1.executionId); assert.ok(accepted1.operation_id);

  // Navigation and versions move durable identities only and do not charge or call a provider.
  const undo1 = await mutate('undo'); assert.equal(undo1.status, 200);
  project = await undo1.json() as Record<string, any>; assert.equal(decodeClaim(project.current_image_artifact_id).storageId, originalStorageId); assert.equal(project.history_index, 0);
  project = await reload(); assert.equal(decodeClaim(project.current_image_artifact_id).storageId, originalStorageId);
  const redo1 = await mutate('redo'); assert.equal(redo1.status, 200);
  project = await redo1.json() as Record<string, any>; assert.equal(decodeClaim(project.current_image_artifact_id).storageId, final1Storage); assert.equal(project.history_index, 1);
  const version1Response = await mutate('versions', { name: 'Final One' }); assert.equal(version1Response.status, 200);
  project = await version1Response.json() as Record<string, any>;
  const version1 = project.versions.find((version: any) => version.name === 'Final One'); assert.ok(version1);
  assert.equal(decodeClaim(version1.artifact_id).storageId, final1Storage);
  assert.equal(await reservations(pool), 1); assert.equal(inferences.length, 1);

  // FINAL #2 must hydrate accepted FINAL #1 internally, never through a delivery/external source URL.
  const currentFinal1 = project.current_image_artifact_id as string;
  const result2 = await execute(currentFinal1, 'history-edit-2');
  assert.equal(result2.status, 'SUCCESS'); assert.equal(result2.verification?.valid, true);
  const final2 = String(result2.finalArtifactId); const final2Storage = decodeClaim(final2).storageId as string;
  assert.equal(externalSourceFetches, 0); assert.equal(inferences.length, 2); assert.equal(initiations.length, 4); assert.equal(binaryUploads.length, 4); assert.equal(await reservations(pool), 2);

  const wrongUserAccept = await fetch(`${baseUrl}/api/core/projects/${projectId}/accept-final`, { method: 'POST', headers: { authorization: `Bearer ${token('other-user')}`, 'content-type': 'application/json' }, body: JSON.stringify({ finalArtifactId: final2 }) });
  assert.notEqual(wrongUserAccept.status, 200);
  const tampered = `${final2.slice(0, -1)}${final2.endsWith('A') ? 'B' : 'A'}`;
  const tamperedAccept = await accept(tampered, 'tampered'); assert.notEqual(tamperedAccept.status, 200);
  const deliveryAsAuthority = await accept(String(result2.imageUrl), 'delivery token is not identity'); assert.notEqual(deliveryAsAuthority.status, 200);
  assert.equal(await historyCount(pool, projectId), 2); assert.equal(await reservations(pool), 2); assert.equal(inferences.length, 2);

  const accept2 = await accept(final2, 'accept final two'); assert.equal(accept2.status, 200);
  project = await accept2.json() as Record<string, any>;
  assert.equal(decodeClaim(project.current_image_artifact_id).storageId, final2Storage); assert.equal(project.history_index, 2);
  const version2Response = await mutate('versions', { name: 'Final Two' }); assert.equal(version2Response.status, 200);
  project = await version2Response.json() as Record<string, any>;
  const version2 = project.versions.find((version: any) => version.name === 'Final Two'); assert.ok(version2);
  assert.equal(decodeClaim(version2.artifact_id).storageId, final2Storage);
  assert.equal(await reservations(pool), 2); assert.equal(inferences.length, 2);

  // Undo to FINAL #1, generate FINAL #3, and accept it: this retires the old FINAL #2 redo branch.
  const undoToFinal1 = await mutate('undo'); assert.equal(undoToFinal1.status, 200);
  project = await undoToFinal1.json() as Record<string, any>;
  assert.equal(decodeClaim(project.current_image_artifact_id).storageId, final1Storage); assert.equal(project.history_index, 1);
  const result3 = await execute(project.current_image_artifact_id, 'history-edit-3');
  assert.equal(result3.status, 'SUCCESS');
  const final3 = String(result3.finalArtifactId); const final3Storage = decodeClaim(final3).storageId as string;
  assert.equal(externalSourceFetches, 0); assert.equal(inferences.length, 3); assert.equal(initiations.length, 6); assert.equal(binaryUploads.length, 6); assert.equal(await reservations(pool), 3);
  const accept3 = await accept(final3, 'accept alternate branch'); assert.equal(accept3.status, 200);
  project = await accept3.json() as Record<string, any>;
  assert.equal(decodeClaim(project.current_image_artifact_id).storageId, final3Storage); assert.equal(project.history_index, 2);
  const retiredFinal2 = (await pool.query('SELECT retired_at FROM canonical_project_history WHERE project_id=$1 AND image_storage_id=$2 AND kind=$3', [projectId, final2Storage, 'ACCEPTED_FINAL'])).rows[0];
  assert.ok(retiredFinal2.retired_at);

  // Named version remains restorable even after its original history branch was retired.
  const restoreVersion = await fetch(`${baseUrl}/api/core/projects/${projectId}/versions/${encodeURIComponent(version2.id)}/restore`, { method: 'POST', headers: jsonHeaders });
  assert.equal(restoreVersion.status, 200);
  project = await restoreVersion.json() as Record<string, any>;
  assert.equal(decodeClaim(project.current_image_artifact_id).storageId, final2Storage); assert.equal(project.history_index, 3);
  const restoredHistory = (await pool.query("SELECT * FROM canonical_project_history WHERE project_id=$1 AND kind='RESTORE_VERSION' AND retired_at IS NULL", [projectId])).rows[0];
  assert.equal(restoredHistory.image_storage_id, final2Storage);
  assert.equal(await reservations(pool), 3); assert.equal(inferences.length, 3);

  const undoRestore = await mutate('undo'); assert.equal(undoRestore.status, 200);
  project = await undoRestore.json() as Record<string, any>; assert.equal(decodeClaim(project.current_image_artifact_id).storageId, final3Storage);
  const redoRestore = await mutate('redo'); assert.equal(redoRestore.status, 200);
  project = await redoRestore.json() as Record<string, any>; assert.equal(decodeClaim(project.current_image_artifact_id).storageId, final2Storage);
  assert.equal(await reservations(pool), 3); assert.equal(inferences.length, 3);

  // A brand-new production composition/server must reload identical durable state from PostgreSQL.
  await closeServer(live.server); await live.production.close(); live = undefined;
  live = await startProduction(fetcher); baseUrl = live.baseUrl;
  project = await reload();
  assert.equal(decodeClaim(project.current_image_artifact_id).storageId, final2Storage);
  assert.equal(project.history_index, 3);
  assert.ok(project.history.some((entry: any) => entry.operation === 'RESTORE_VERSION'));
  assert.ok(project.versions.some((version: any) => version.id === version2.id));
  assert.equal(await reservations(pool), 3); assert.equal(inferences.length, 3); assert.equal(externalSourceFetches, 0);

  // Cross-project FINAL identity cannot authorize acceptance.
  const otherCreate = await fetch(`${baseUrl}/api/core/projects?name=Other`, { method: 'POST', headers: { authorization: auth, 'content-type': 'image/png' }, body: uploadPng });
  assert.equal(otherCreate.status, 201); const otherProject = await otherCreate.json() as Record<string, any>;
  const crossProject = await fetch(`${baseUrl}/api/core/projects/${otherProject.id}/accept-final`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ finalArtifactId: final1, instruction: 'cross project' }) });
  assert.notEqual(crossProject.status, 200);
  assert.equal(await reservations(pool), 3); assert.equal(inferences.length, 3);
});
