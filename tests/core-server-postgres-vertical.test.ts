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
import { SelectionApplicationService } from '../src/application/selection/SelectionApplicationService.ts';
import { CoreMaskArtifactPort } from '../src/application/selection/CoreMaskArtifactPort.js';
import { createCreativeEditApplicationService } from '../src/application/creative/CreativeEditApplicationService.js';
import { buildRoi, createOriginalMask } from '../src/platform/creative/pipeline/ControlledLocalEdit.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: this suite must use real PostgreSQL');

const jwtSecret = 'vertical-jwt-secret';
const artifactSecret = 'vertical-artifact-secret';
const tenantId = 'vertical-tenant';
const projectId = 'vertical-project';
const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'deterministic-fixture',
  falBaseUrl: 'https://provider.vertical.test', jwtSecret, jwtIssuer: 'vertical-test', jwtAudience: 'vertical-core',
  artifactSigningSecret: artifactSecret, trustedAssetHosts: Object.freeze(['assets.vertical.test']), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1, bodyLimitBytes: 64_000,
  maskUploadLimitBytes: 64_000, maskMaxDimension: 256,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

type ProviderMode = 'success' | 'failure' | 'unknown';
type DatabaseState = { reservations: Array<Record<string, unknown>>; journal: Array<Record<string, unknown>>; wallet: Record<string, unknown> };

function deterministicProvider() {
  let mode: ProviderMode = 'success';
  const calls: Array<{ prompt: string; imageUrl: string }> = [];
  let originalAssetFetches = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://assets.vertical.test/output/')) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (url === 'https://assets.vertical.test/input.png') originalAssetFetches++;
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body)) as { prompt: string; image_url: string };
    calls.push({ prompt: body.prompt, imageUrl: body.image_url });
    if (mode === 'unknown') throw new DOMException('Accepted request timed out', 'AbortError');
    if (mode === 'failure') return new Response(JSON.stringify({ message: 'deterministic rejection' }), { status: 422, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ image: { url: `https://assets.vertical.test/output/${calls.length}.png` } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetcher, setMode(value: ProviderMode) { mode = value; }, count: () => calls.length, originalAssetFetches: () => originalAssetFetches, prompts: () => calls.map(call => call.prompt), imageUrls: () => calls.map(call => call.imageUrl) };
}

function token(userId: string, valid = true, ownerTenant = tenantId): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: userId, tenantId: ownerTenant, iss: config.jwtIssuer, aud: config.jwtAudience, exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = createHmac('sha256', valid ? jwtSecret : 'wrong-secret').update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function artifact(userId: string, ownerProject = projectId): string {
  const payload = Buffer.from(JSON.stringify({ id: `input-${userId}`, url: 'https://assets.vertical.test/input.png', tenantId, userId, projectId: ownerProject, exp: Date.now() + 600_000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', artifactSecret).update(payload).digest('base64url')}`;
}

async function start(pool: Pool, provider: ReturnType<typeof deterministicProvider>) {
  const production = await createProductionCore(config, { fetcher: provider.fetcher });
  const server = createServer(createNodeHttpAdapter({ core: production.core, artifacts: production.artifacts, projects: production.projects, auth: production.auth, config, ready: async () => true, accepting: () => true }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address === 'object');
  return { production, server, url: `http://127.0.0.1:${address.port}`, stop: async () => { await closeServer(server); await production.close(); } };
}

async function closeServer(server: Server) { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
async function wallet(pool: Pool, userId: string, balance = 20) { await pool.query('INSERT INTO credit_wallets (owner_id,total_credited,balance) VALUES ($1,$2,$2)', [userId, balance]); }
async function state(pool: Pool, userId: string): Promise<DatabaseState> {
  const reservations = await pool.query('SELECT * FROM credit_reservations WHERE owner_id=$1 ORDER BY created_at,id', [userId]);
  const journal = await pool.query('SELECT j.* FROM transaction_journal j JOIN credit_reservations r ON r.id=j.reservation_id WHERE r.owner_id=$1 ORDER BY j.occurred_at,j.sequence', [userId]);
  const walletResult = await pool.query('SELECT * FROM credit_wallets WHERE owner_id=$1', [userId]);
  return { reservations: reservations.rows, journal: journal.rows, wallet: walletResult.rows[0] ?? {} };
}
async function execute(url: string, userId: string, clientRequestId: string, options: { auth?: string; artifactId?: string; correlationId?: string } = {}) {
  const correlationId = options.correlationId ?? `correlation-${clientRequestId}`;
  const response = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { authorization: `Bearer ${options.auth ?? token(userId)}`, 'content-type': 'application/json', 'x-correlation-id': correlationId }, body: JSON.stringify({ projectId, instruction: clientRequestId, inputArtifactId: options.artifactId ?? artifact(userId), clientRequestId }) });
  return { response, body: await response.json() as Record<string, unknown>, correlationId };
}
function events(value: DatabaseState) { return value.journal.map(row => row.event); }

function stackLocation(error: Error): string | undefined {
  return error.stack?.split('\n').slice(1).map(line => line.trim()).find(Boolean);
}

function failureStage(value: DatabaseState, providerCalls: number): string {
  if (value.reservations.length === 0) return 'before or inside reservation';
  if (providerCalls === 0) return 'after reservation and before provider dispatch';
  if (events(value).includes('provider_succeeded') && !value.reservations.some(row => row.status === 'committed')) return 'transaction journal or commit';
  if (value.reservations.some(row => row.status === 'reserved')) return 'provider, verification, or commit path';
  if (value.reservations.some(row => row.status === 'committed')) return 'after commit';
  return 'undetermined; inspect reservation statuses and journal events';
}

async function throwUnexpectedSuccessDiagnostic(
  runtime: Awaited<ReturnType<typeof start>>,
  provider: ReturnType<typeof deterministicProvider>,
  pool: Pool,
  successUser: string,
  successArtifact: string,
  success: Awaited<ReturnType<typeof execute>>,
): Promise<void> {
  const providerCalls = provider.count();
  try {
    await runtime.production.core.service.execute(
      { projectId, instruction: 'success-1', inputArtifactId: successArtifact, clientRequestId: 'success-1' },
      { tenantId, userId: successUser },
      success.correlationId,
    );
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught));
    const technical = caught && typeof caught === 'object' ? caught as { code?: unknown; status?: unknown } : {};
    const successState = await state(pool, successUser);
    const providerCallsAfterDiagnostic = provider.count();
    const diagnostic = {
      originalError: {
        name: error.name,
        message: error.message,
        code: technical.code,
        status: technical.status,
        stackLocation: stackLocation(error),
      },
      http: { status: success.response.status, publicBody: success.body },
      providerCallCount: providerCallsAfterDiagnostic,
      providerCallCountBeforeDiagnostic: providerCalls,
      reservationCount: successState.reservations.length,
      reservationStatuses: successState.reservations.map(row => row.status),
      journalEvents: events(successState),
      wallet: { balance: successState.wallet.balance, reserved: successState.wallet.reserved },
      failureStage: failureStage(successState, providerCallsAfterDiagnostic),
    };
    assert.equal(providerCallsAfterDiagnostic, providerCalls, `diagnostic replay must reuse the inflight execution:\n${JSON.stringify(diagnostic, null, 2)}`);
    throw new Error(`Unexpected first-success HTTP response; original service failure:\n${JSON.stringify(diagnostic, null, 2)}`, { cause: error });
  }
  assert.fail(`Unexpected first-success HTTP ${success.response.status}; inflight service execution resolved instead of reproducing the failure`);
}

test('real Core HTTP server proves PostgreSQL financial lifecycle and safety invariants', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'core-vertical-fixture' });
  await migrateTransactionSchema(pool);
  await migrateMaskArtifactSchema(pool); await migrateImageArtifactSchema(pool); await migrateProjectSchema(pool);
  await pool.query('TRUNCATE transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => { await pool.query('TRUNCATE transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE'); await pool.end(); });
  const provider = deterministicProvider();
  let runtime = await start(pool, provider);
  t.after(async () => { if (runtime) await runtime.stop(); });

  const successUser = 'vertical-success'; await wallet(pool, successUser);
  const successArtifact = artifact(successUser);
  const success = await execute(runtime.url, successUser, 'success-1', { correlationId: 'http-success-correlation', artifactId: successArtifact });
  if (success.response.status !== 200) await throwUnexpectedSuccessDiagnostic(runtime, provider, pool, successUser, successArtifact, success);
  assert.equal(success.response.status, 200); assert.equal(success.body.status, 'SUCCESS'); assert.equal(success.body.correlationId, success.correlationId);
  const successState = await state(pool, successUser);
  assert.equal(successState.reservations.length, 1); assert.equal(successState.reservations[0].status, 'committed');
  assert.deepEqual(events(successState), ['reservation_created', 'provider_dispatched', 'provider_succeeded', 'reservation_committed']);
  assert.equal(successState.reservations[0].correlation_id, success.body.executionId);
  assert.equal(successState.reservations[0].operation_id, `creative.execution.${success.body.executionId}`);
  assert.equal(successState.journal.every(row => row.correlation_id === success.body.executionId), true);
  assert.equal(provider.prompts().at(-1), 'success-1');
  assert.equal(provider.imageUrls().at(-1), 'https://assets.vertical.test/input.png');
  assert.equal(provider.originalAssetFetches(), 0);

  provider.setMode('failure'); const failedUser = 'vertical-failed'; await wallet(pool, failedUser, 10); const beforeFailedCalls = provider.count();
  const failed = await execute(runtime.url, failedUser, 'failure-1'); assert.equal(failed.response.status, 200); assert.equal(failed.body.status, 'FAILED'); assert.equal(provider.count() - beforeFailedCalls, 1);
  const failedState = await state(pool, failedUser); assert.equal(failedState.reservations.length, 1); assert.equal(failedState.reservations[0].status, 'released'); assert.equal(failedState.wallet.balance, '10'); assert.equal(failedState.wallet.reserved, '0');
  assert.deepEqual(events(failedState), ['reservation_created', 'provider_dispatched', 'provider_failed', 'reservation_released']);

  provider.setMode('unknown'); const unknownUser = 'vertical-unknown'; await wallet(pool, unknownUser, 10); const beforeUnknownCalls = provider.count();
  const unknown = await execute(runtime.url, unknownUser, 'unknown-1'); assert.equal(unknown.response.status, 202); assert.equal(unknown.body.status, 'UNKNOWN'); assert.equal(provider.count() - beforeUnknownCalls, 1);
  const unknownState = await state(pool, unknownUser); assert.equal(unknownState.reservations[0].status, 'reserved'); assert.equal(unknownState.wallet.reserved, '1');
  assert.deepEqual(events(unknownState), ['reservation_created', 'provider_dispatched', 'recovery_deferred']);
  await runtime.stop();
  runtime = await start(pool, provider);
  const afterRestart = await state(pool, unknownUser); assert.equal(afterRestart.reservations[0].status, 'reserved'); assert.equal(afterRestart.wallet.reserved, '1'); assert.deepEqual(events(afterRestart), events(unknownState));

  provider.setMode('success'); const duplicateUser = 'vertical-duplicate'; await wallet(pool, duplicateUser); const beforeDuplicateCalls = provider.count();
  const duplicates = await Promise.all([execute(runtime.url, duplicateUser, 'duplicate-1'), execute(runtime.url, duplicateUser, 'duplicate-1')]);
  assert.deepEqual(duplicates.map(item => item.response.status), [200, 200]); assert.equal(provider.count() - beforeDuplicateCalls, 1);
  assert.equal(duplicates[0].body.executionId, duplicates[1].body.executionId);
  const duplicateState = await state(pool, duplicateUser); assert.equal(duplicateState.reservations.length, 1); assert.equal(events(duplicateState).filter(event => event === 'reservation_created').length, 1);

  const distinctUser = 'vertical-distinct'; await wallet(pool, distinctUser); const beforeDistinctCalls = provider.count();
  await Promise.all([execute(runtime.url, distinctUser, 'distinct-1'), execute(runtime.url, distinctUser, 'distinct-2')]);
  const distinctState = await state(pool, distinctUser); assert.equal(provider.count() - beforeDistinctCalls, 2); assert.equal(distinctState.reservations.length, 2); assert.equal(new Set(distinctState.reservations.map(row => row.idempotency_key)).size, 2);

  const unauthenticatedUser = 'vertical-unauthenticated'; await wallet(pool, unauthenticatedUser); const beforeAuthCalls = provider.count();
  const unauthenticated = await execute(runtime.url, unauthenticatedUser, 'auth-1', { auth: token(unauthenticatedUser, false) }); assert.equal(unauthenticated.response.status, 401); assert.equal(provider.count(), beforeAuthCalls); assert.equal((await state(pool, unauthenticatedUser)).reservations.length, 0);

  const artifactUser = 'vertical-artifact'; await wallet(pool, artifactUser); const beforeArtifactCalls = provider.count();
  const deniedArtifact = await execute(runtime.url, artifactUser, 'artifact-1', { artifactId: artifact('somebody-else') }); assert.equal(deniedArtifact.response.status, 403); assert.equal(provider.count(), beforeArtifactCalls); assert.equal((await state(pool, artifactUser)).reservations.length, 0);

  const budgetUser = 'vertical-budget'; await wallet(pool, budgetUser, 0); const beforeBudgetCalls = provider.count();
  const deniedBudget = await execute(runtime.url, budgetUser, 'budget-1'); assert.equal(deniedBudget.response.status, 403); assert.equal(provider.count(), beforeBudgetCalls); assert.equal((await state(pool, budgetUser)).reservations.length, 0);

  const rollbackUser = 'vertical-rollback'; await wallet(pool, rollbackUser); const beforeRollbackCalls = provider.count();
  await pool.query("CREATE FUNCTION vertical_force_journal_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced vertical rollback'; END $$");
  await pool.query('CREATE TRIGGER vertical_force_journal_failure BEFORE INSERT ON transaction_journal FOR EACH ROW EXECUTE FUNCTION vertical_force_journal_failure()');
  try { const rolledBack = await execute(runtime.url, rollbackUser, 'rollback-1'); assert.equal(rolledBack.response.status, 500); }
  finally { await pool.query('DROP TRIGGER vertical_force_journal_failure ON transaction_journal'); await pool.query('DROP FUNCTION vertical_force_journal_failure()'); }
  const rollbackState = await state(pool, rollbackUser); assert.equal(provider.count(), beforeRollbackCalls); assert.equal(rollbackState.reservations.length, 0); assert.equal(rollbackState.wallet.reserved, '0'); assert.equal(rollbackState.wallet.balance, '20');
});

test('real Editor to Core controlled edit persists and securely delivers a verified PostgreSQL COMPOSITE', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'controlled-core-vertical' });
  await migrateTransactionSchema(pool); await migrateMaskArtifactSchema(pool); await migrateImageArtifactSchema(pool); await migrateProjectSchema(pool);
  await pool.query('TRUNCATE canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => { await pool.query('TRUNCATE canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE'); await pool.end(); });

  const width = 16, height = 12;
  const originalPixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) originalPixels.set([(i * 7) % 251, (i * 11) % 253, (i * 13) % 255, 255], i * 4);
  const originalPng = new Uint8Array(await sharp(originalPixels, { raw: { width, height, channels: 4 } }).png().toBuffer());
  const alpha = new Uint8Array(width * height); for (const [x, y] of [[7, 5], [8, 5], [7, 6], [8, 6]]) alpha[y * width + x] = 255;
  assert.deepEqual([width, height], [16, 12], 'ORIGINAL fixture geometry must remain deterministic');
  const selectedXs: number[] = [], selectedYs: number[] = [];
  for (let index = 0; index < alpha.length; index++) if (alpha[index]) { selectedXs.push(index % width); selectedYs.push(Math.floor(index / width)); }
  const selectedBounds = { x: Math.min(...selectedXs), y: Math.min(...selectedYs), width: Math.max(...selectedXs) - Math.min(...selectedXs) + 1, height: Math.max(...selectedYs) - Math.min(...selectedYs) + 1 };
  assert.deepEqual(selectedBounds, { x: 7, y: 5, width: 2, height: 2 }, 'canonical MASK selection must cover exactly the intended 2x2 pixels');
  const computedRoi = buildRoi(createOriginalMask({ artifactId: 'fixture-mask', width, height, source: 'USER', alpha }), { width, height }, { preserveMode: 'STRICT', haloPixels: 0, haloRatio: .1, minimumProviderSize: 1 });
  assert.deepEqual(computedRoi.bounds, { x: 6, y: 4, width: 4, height: 4 }, 'the default 10% policy must add a canonical 1px context halo on every side');
  const uploads: Array<{ url: string; headers: Headers; bytes: Uint8Array }> = [];
  const initiations: Array<{ headers: Headers; fileUrl: string }> = [];
  const inferences: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  let uploadFailure = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input), headers = new Headers(init?.headers);
    if (url === 'https://assets.vertical.test/input.png') {
      assert.equal(headers.has('authorization'), false, 'provider secret must not be sent while hydrating ORIGINAL');
      return new Response(originalPng, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (url === 'https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3') {
      assert.equal(init?.method, 'POST'); assert.equal(headers.get('authorization'), `Key ${config.falKey}`);
      const index = initiations.length; const fileUrl = `https://fal-cdn.vertical.test/input-${index}.png`;
      initiations.push({ headers, fileUrl });
      return new Response(JSON.stringify({ upload_url: `https://upload.vertical.test/${index}`, file_url: fileUrl }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.startsWith('https://upload.vertical.test/')) {
      assert.equal(init?.method, 'PUT'); assert.equal(headers.has('authorization'), false, 'FAL_KEY must not be sent to signed binary upload URLs');
      const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer()); uploads.push({ url, headers, bytes });
      return new Response('', { status: uploadFailure ? 503 : 200 });
    }
    if (url === `${config.falBaseUrl}/fal-ai/flux-pro/v1/fill`) {
      assert.equal(init?.method, 'POST'); assert.equal(headers.get('authorization'), `Key ${config.falKey}`);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>; inferences.push({ headers, body });
      const roiMeta = await sharp(uploads.at(-2)!.bytes).metadata();
      const patch = await sharp({ create: { width: roiMeta.width!, height: roiMeta.height!, channels: 4, background: { r: 255, g: 1, b: 2, alpha: 1 } } }).png().toBuffer();
      uploads.push({ url: 'https://provider-output.vertical.test/patch.png', headers: new Headers(), bytes: new Uint8Array(patch) });
      return new Response(JSON.stringify({ images: [{ url: 'https://provider-output.vertical.test/patch.png' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === 'https://provider-output.vertical.test/patch.png') return new Response(uploads.at(-1)!.bytes, { status: 200, headers: { 'content-type': 'image/png' } });
    throw new Error(`Unexpected external HTTP boundary: ${url}`);
  };

  let now = Date.now();
  const production = await createProductionCore(config, { fetcher, now: () => now });
  const server = createServer(createNodeHttpAdapter({ core: production.core, artifacts: production.artifacts, projects: production.projects, auth: production.auth, config, ready: async () => true, accepting: () => true }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`; t.after(async () => { await closeServer(server); await production.close(); });
  const userId = 'controlled-user'; await wallet(pool, userId, 20);
  const authHeaders = { authorization: `Bearer ${token(userId)}` };
  const persistMask = async (value = alpha, ownerProject = projectId) => {
    const response = await fetch(`${url}/api/core/artifacts/masks?projectId=${encodeURIComponent(ownerProject)}&width=${width}&height=${height}`, { method: 'POST', headers: { ...authHeaders, 'content-type': 'application/octet-stream' }, body: value });
    return { response, body: await response.json() as Record<string, unknown> };
  };
  const persistedMask = await persistMask(); assert.equal(persistedMask.response.status, 201);
  const maskId = String(persistedMask.body.artifactId); assert.equal(JSON.parse(Buffer.from(maskId.split('.')[0], 'base64url').toString()).location, 'STORED_MASK');

  const beforeInference = inferences.length, beforeInitiations = initiations.length, beforeUploads = uploads.length;
  const controlled = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { ...authHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ projectId, instruction: 'replace only the selected pixels', inputArtifactId: artifact(userId), maskArtifactIds: [maskId], selectedObjectIds: ['selected-object'], preserveMode: 'STRICT', clientRequestId: 'controlled-http-1' }) });
  const result = await controlled.json() as Record<string, any>; assert.equal(controlled.status, 200); assert.equal(result.status, 'SUCCESS'); assert.equal(result.verification.valid, true);
  assert.equal(inferences.length - beforeInference, 1, 'controlled execution must dispatch exactly one inference');
  assert.equal(initiations.length - beforeInitiations, 2, 'actual materializer must initiate exactly ROI and MASK uploads');
  const binaryUploads = uploads.slice(beforeUploads).filter(item => item.url.startsWith('https://upload.vertical.test/')); assert.equal(binaryUploads.length, 2);
  const uploadMetadata = await Promise.all(binaryUploads.map(item => sharp(item.bytes).metadata()));
  assert.deepEqual(uploadMetadata.map(item => [item.width, item.height]), [[4, 4], [4, 4]], 'provider ROI and MASK must both include the exact canonical context halo');
  const providerMask = await sharp(binaryUploads[1].bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([providerMask.info.width, providerMask.info.height], [4, 4]);
  const providerMaskPixels = [...providerMask.data];
  assert.equal(providerMaskPixels.filter(value => value !== 0).length, 4, 'only four provider-mask pixels may be editable');
  assert.deepEqual(providerMaskPixels, [
    0, 0, 0, 0,
    0, 255, 255, 0,
    0, 255, 255, 0,
    0, 0, 0, 0,
  ], 'the selected 2x2 must remain centered and the 1px context halo must remain preserve/black');
  assert.equal(inferences[0].body.image_url, initiations[0].fileUrl); assert.equal(inferences[0].body.mask_url, initiations[1].fileUrl);
  assert.equal(JSON.stringify(result).includes(config.falKey), false, 'FAL_KEY must never enter browser JSON');

  const finalClaim = JSON.parse(Buffer.from(String(result.finalArtifactId).split('.')[0], 'base64url').toString());
  assert.equal(finalClaim.location, 'STORED_FINAL_ID'); assert.equal(finalClaim.role, 'COMPOSITE'); assert.equal(finalClaim.lifecycle, 'FINAL');
  const deliveryClaim = JSON.parse(Buffer.from(String(result.imageUrl).split('/').at(-1).split('.')[0], 'base64url').toString()); assert.equal(deliveryClaim.location, 'STORED_FINAL_DELIVERY');
  const stableIdDelivery = await fetch(`${url}/api/core/artifacts/results/${encodeURIComponent(result.finalArtifactId)}`); assert.notEqual(stableIdDelivery.status, 200);
  const delivered = await fetch(`${url}${result.imageUrl}`); assert.equal(delivered.status, 200); assert.equal(delivered.headers.get('content-type'), 'image/png');
  const deliveredBytes = new Uint8Array(await delivered.arrayBuffer()); const decoded = await sharp(deliveredBytes).raw().toBuffer({ resolveWithObject: true }); assert.deepEqual([decoded.info.width, decoded.info.height], [width, height]);
  let selectedChanged = 0; for (let i = 0; i < alpha.length; i++) { const pixel = decoded.data.subarray(i * 4, i * 4 + 4); if (!alpha[i]) assert.deepEqual([...pixel], [...originalPixels.subarray(i * 4, i * 4 + 4)], `protected pixel ${i}`); else if (!Buffer.from(pixel).equals(Buffer.from(originalPixels.subarray(i * 4, i * 4 + 4)))) selectedChanged++; }
  assert.ok(selectedChanged > 0);
  const finalRow = (await pool.query('SELECT * FROM canonical_image_artifacts WHERE storage_id=$1', [finalClaim.storageId])).rows[0];
  assert.equal(finalRow.role, 'COMPOSITE'); assert.equal(finalRow.lifecycle, 'FINAL'); assert.equal(finalRow.tenant_id, tenantId); assert.equal(finalRow.user_id, userId); assert.equal(finalRow.project_id, projectId); assert.equal(finalRow.execution_id, result.executionId);
  assert.deepEqual(new Uint8Array(finalRow.image_bytes), deliveredBytes, 'persisted and delivered canonical PNG bytes must be exact');
  const persistedDecoded = await sharp(finalRow.image_bytes).raw().toBuffer(); assert.deepEqual(persistedDecoded, decoded.data);
  const canonicalOutcome = production.core.service.result(result.executionId, { tenantId, userId }); const canonicalComposite = canonicalOutcome?.artifacts.find(item => item.role === 'COMPOSITE');
  assert.equal((canonicalComposite?.metadata?.integrityMetrics as { outsideChangedPixelRatio?: number })?.outsideChangedPixelRatio, 0);
  const roles = result.artifacts.map((item: Record<string, unknown>) => item.role); for (const role of ['ORIGINAL', 'MASK', 'ROI_INPUT', 'PATCH', 'COMPOSITE']) assert.ok(roles.includes(role), `missing canonical lineage role ${role}`);
  const controlledState = await state(pool, userId); assert.deepEqual(events(controlledState), ['reservation_created', 'provider_dispatched', 'provider_succeeded', 'reservation_committed']);

  const wrongUserCalls = inferences.length; const wrongUser = await fetch(`${url}/api/core/creative/${result.executionId}/result`, { headers: { authorization: `Bearer ${token('wrong-user')}` } }); assert.equal(wrongUser.status, 403);
  const wrongTenant = await fetch(`${url}/api/core/creative/${result.executionId}/result`, { headers: { authorization: `Bearer ${token(userId, true, 'wrong-tenant')}` } }); assert.equal(wrongTenant.status, 403); assert.equal(inferences.length, wrongUserCalls);
  const badMask = `${maskId.slice(0, -1)}${maskId.endsWith('a') ? 'b' : 'a'}`;
  const callsBeforeBadMask = inferences.length, reservationsBeforeBadMask = (await state(pool, userId)).reservations.length; const rejectedMask = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { ...authHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ projectId, instruction: 'denied', inputArtifactId: artifact(userId), maskArtifactIds: [badMask], selectedObjectIds: ['x'], preserveMode: 'STRICT', clientRequestId: 'bad-mask' }) }); assert.equal(rejectedMask.status, 403); assert.equal(inferences.length, callsBeforeBadMask); assert.equal((await state(pool, userId)).reservations.length, reservationsBeforeBadMask);
  const otherProjectMask = await persistMask(alpha, 'wrong-project'); const callsBeforeProject = inferences.length; const rejectedProject = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { ...authHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ projectId, instruction: 'denied', inputArtifactId: artifact(userId), maskArtifactIds: [otherProjectMask.body.artifactId], selectedObjectIds: ['x'], clientRequestId: 'wrong-project-mask' }) }); assert.equal(rejectedProject.status, 403); assert.equal(inferences.length, callsBeforeProject);
  assert.throws(() => production.artifacts.external.resolveStoredFinalId(result.finalArtifactId, { tenantId, userId, projectId: 'wrong-project' }));

  const oldUrl = result.imageUrl; now += 300_001; assert.notEqual((await fetch(`${url}${oldUrl}`)).status, 200); const tamperedUrl = `${oldUrl.slice(0, -1)}x`; assert.notEqual((await fetch(`${url}${tamperedUrl}`)).status, 200);
  const refreshed = await fetch(`${url}/api/core/creative/${result.executionId}/result`, { headers: authHeaders }); const freshResult = await refreshed.json() as Record<string, any>; assert.equal(refreshed.status, 200); assert.equal(freshResult.finalArtifactId, result.finalArtifactId); assert.notEqual(freshResult.imageUrl, oldUrl); const freshDelivery = await fetch(`${url}${freshResult.imageUrl}`); assert.equal(freshDelivery.status, 200); assert.deepEqual(new Uint8Array(await freshDelivery.arrayBuffer()), deliveredBytes);

  const browserClient = { artifacts: { persistMask: async ({ projectId: requestedProject, width: w, height: h, alpha: bytes }: any) => { const response = await fetch(`${url}/api/core/artifacts/masks?projectId=${requestedProject}&width=${w}&height=${h}`, { method: 'POST', headers: { ...authHeaders, 'content-type': 'application/octet-stream' }, body: bytes }); return response.json(); } }, creative: { execute: async (body: unknown) => { const response = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { ...authHeaders, 'content-type': 'application/json' }, body: JSON.stringify(body) }); return response.json(); }, cancel() {}, status() {} } };
  const selection = new SelectionApplicationService({ async segment() { throw new Error('not used'); }, cancel() {} }, new CoreMaskArtifactPort(projectId, browserClient)); selection.start({ imageArtifactId: artifact(userId), width, height }); selection.setMode('BRUSH_ADD'); selection.brush({ points: [{ x: 7.5, y: 5.5 }], radius: 1, hardness: 1, view: { originalWidth: width, originalHeight: height, displayWidth: width, displayHeight: height } }); const editorMask = await selection.done();
  assert.equal(JSON.parse(Buffer.from(editorMask.id.split('.')[0], 'base64url').toString()).location, 'STORED_MASK', 'Editor must use the server-issued MASK identity');
  const appCalls = inferences.length; const appResult = await createCreativeEditApplicationService(browserClient).execute({ projectId, instruction: 'application adapter edit', inputArtifactId: artifact(userId), maskArtifactIds: [editorMask.id], selectedObjectIds: ['editor-object'], preserveMode: 'STRICT', clientRequestId: 'editor-controlled' });
  assert.equal(appResult.status, 'SUCCESS'); assert.ok(appResult.executionId); assert.ok(appResult.imageUrl); assert.ok(appResult.finalArtifactId); assert.equal(appResult.verification.valid, true); assert.equal(inferences.length - appCalls, 1); assert.equal(JSON.stringify(appResult).includes('Uint8ClampedArray'), false); assert.equal('data' in appResult, false); assert.equal((await fetch(`${url}${appResult.imageUrl}`)).status, 200);

  uploadFailure = true; const uploadUser = 'controlled-upload-failure'; await wallet(pool, uploadUser); const uploadMaskResponse = await fetch(`${url}/api/core/artifacts/masks?projectId=${projectId}&width=${width}&height=${height}`, { method: 'POST', headers: { authorization: `Bearer ${token(uploadUser)}`, 'content-type': 'application/octet-stream' }, body: alpha }); const uploadMask = await uploadMaskResponse.json() as Record<string, unknown>; const callsBeforeUploadFailure = inferences.length; const failedUpload = await fetch(`${url}/api/core/creative/execute`, { method: 'POST', headers: { authorization: `Bearer ${token(uploadUser)}`, 'content-type': 'application/json' }, body: JSON.stringify({ projectId, instruction: 'fail upload', inputArtifactId: artifact(uploadUser), maskArtifactIds: [uploadMask.artifactId], selectedObjectIds: ['x'], preserveMode: 'STRICT', clientRequestId: 'upload-failure' }) }); const failedUploadBody = await failedUpload.json() as Record<string, unknown>; assert.equal(failedUploadBody.status, 'FAILED'); assert.equal(inferences.length, callsBeforeUploadFailure); const failedUploadState = await state(pool, uploadUser); assert.equal(failedUploadState.reservations.length, 1); assert.equal(failedUploadState.reservations[0].status, 'released'); assert.deepEqual(events(failedUploadState), ['reservation_created', 'provider_dispatched', 'provider_failed', 'reservation_released']);

  await pool.query('UPDATE canonical_image_artifacts SET revoked_at=NOW() WHERE storage_id=$1', [finalClaim.storageId]); assert.notEqual((await fetch(`${url}${freshResult.imageUrl}`)).status, 200, 'revoked FINAL delivery must fail closed');
});
