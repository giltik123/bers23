import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { Pool } from 'pg';
import sharp from 'sharp';
import { build } from 'vite';
import { createProductionCore } from '../server/core/composition/createProductionCore.ts';
import { createCanonicalNodeHttpAdapter } from '../server/core/http/canonicalNodeHttpAdapter.ts';
import { createLocalCompositeContinuationHttpAdapter } from '../server/core/http/localCompositeContinuationHttpAdapter.ts';
import { applyCoreSecurityHeaders } from '../server/core/http/securityHeaders.ts';
import { LocalCompositeOutputUploadService } from '../server/core/workflow/LocalCompositeOutputUploadService.ts';
import { migrateFinalImageLineageSchema } from '../server/core/artifacts/finalImageLineageSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../src/platform/creative/canonical/localComposite.ts';
import { isolateBackgroundRgba } from '../src/platform/creative/deterministic/BackgroundIsolation.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for C5B browser reconnect acceptance');

const host = '127.0.0.1';
const port = 4178;
const origin = `http://${host}:${port}`;
const outputDir = path.resolve('.test-cache/c5b-browser-dist');
const tenantId = 'c5b-browser-tenant';
const userId = 'c5b-browser-user';
const email = 'c5b-browser@example.test';
const password = 'C5b-Browser-Password-42!';
const testMobileSam = Object.freeze({ modelId: 'mobilesam-vit-t', version: '1.0.2' });
const testModels = Object.freeze({
  [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment]: Object.freeze([testMobileSam]),
});
const analysis = Object.freeze({ originalWidth: 4, originalHeight: 4, analysisWidth: 4, analysisHeight: 4, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
const points = Object.freeze([Object.freeze({ x: 1, y: 1, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' })]);
const config = Object.freeze({
  nodeEnv: 'test', port, databaseUrl, provider: 'FAL', falKey: 'must-not-be-called', falBaseUrl: 'https://provider.c5b.invalid',
  jwtSecret: 'c5b-browser-jwt-secret', jwtIssuer: 'c5b-browser-test', jwtAudience: 'c5b-browser-core',
  artifactSigningSecret: 'c5b-browser-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([origin]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 128_000, maskUploadLimitBytes: 128_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 2_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 10_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
  authPublicOrigin: origin, authDefaultTenantId: tenantId, authChallengeSecret: 'c5b-browser-csrf-secret',
});

const setupPool = new Pool({ connectionString: databaseUrl, max: 8, application_name: 'bers-c5b-browser-reconnect' });
await migrateTransactionSchema(setupPool);
await migrateFinalImageLineageSchema(setupPool);
await migrateProjectSchema(setupPool);

let providerCalls = 0;
const forbiddenFetcher = async () => {
  providerCalls += 1;
  throw new Error('C5B browser acceptance must not cross an external provider boundary');
};

const originalPixels = new Uint8ClampedArray([
  11,21,31,255, 12,22,32,200, 13,23,33,128, 14,24,34,0,
  41,51,61,255, 42,52,62,220, 43,53,63,100, 44,54,64,1,
  71,81,91,255, 72,82,92,180, 73,83,93,64, 74,84,94,10,
  101,111,121,255, 102,112,122,160, 103,113,123,32, 104,114,124,0,
]);
const maskAlpha = new Uint8Array([255,128,0,255, 64,255,128,0, 255,200,32,255, 1,254,127,255]);
const sourcePng = await rgbaPng(4, 4, originalPixels);

await build({
  root: path.resolve('.'),
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    rollupOptions: { input: path.resolve('tests/local-composite-browser-reconnect.html') },
  },
});

let production = await createProductionCore(config, { fetcher: forbiddenFetcher, testLocalModelsByCapability: testModels });
await production.auth.store.provisionLocalUser({ tenantId, userId, email, password, displayName: 'C5B Browser User' });
const project = await production.projects.create({ tenantId, userId }, 'C5B Browser Project', sourcePng, { maxDimension: 256, maxPixels: 65_536 });
const projectId = String(project.project_id);
const scope = Object.freeze({ tenantId, userId, projectId });
const originalStorageId = String(project.original_image_storage_id);
const inputArtifactId = production.artifacts.external.issueStoredOriginal(originalStorageId, scope);
const storedSource = await production.artifacts.images.loadSource(originalStorageId, scope);
assert.ok(storedSource, 'canonical ORIGINAL must be available before browser acceptance');
const decodedSource = await decodedRgba(storedSource.bytes);
const expectedComposite = isolateBackgroundRgba(decodedSource.data, maskAlpha, decodedSource.width, decodedSource.height);
const compositePng = await rgbaPng(decodedSource.width, decodedSource.height, expectedComposite);
const fixture = Object.freeze({
  tenantId, userId, email, password, projectId, inputArtifactId,
  clientRequestId: 'c5b-browser-reconnect-request', analysis, points,
  maskAlphaBase64: Buffer.from(maskAlpha).toString('base64'),
  compositePngBase64: Buffer.from(compositePng).toString('base64'),
});

const beforeCredits = Number((await setupPool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count);
let server = await startHttp(production, fixture);
let browser;
const diagnostics = { pageErrors: [], consoleErrors: [], failedRequests: [], failedResponses: [] };
try {
  try { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (error) { throw new Error(`Mandatory system Google Chrome launch failed: ${error instanceof Error ? error.message : error}`); }
  const version = browser.version();
  assert.match(version, /Chrome|Chromium|\d+\./);
  const page = await browser.newPage();
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' }));
  page.on('response', response => { if (response.status() >= 500) diagnostics.failedResponses.push({ url: response.url(), status: response.status() }); });

  await page.goto(`${origin}/tests/local-composite-browser-reconnect.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof globalThis.beginC5BBrowserAcceptance === 'function', undefined, { timeout: 15_000 });
  const first = await page.evaluate(() => globalThis.beginC5BBrowserAcceptance());
  assert.equal(first.afterSegmentState, 'WAITING_FOR_LOCAL_RESULT');
  assert.deepEqual(first.sessionStorageKeys, ['bers:c5b:execution-id']);
  assert.ok(first.executionId && first.backgroundTicketId);

  await stopHttp(server); server = undefined;
  await production.close();
  production = await createProductionCore(config, { fetcher: forbiddenFetcher, testLocalModelsByCapability: testModels });
  server = await startHttp(production, fixture);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof globalThis.resumeC5BBrowserAcceptanceAfterReload === 'function', undefined, { timeout: 15_000 });
  const second = await page.evaluate(() => globalThis.resumeC5BBrowserAcceptanceAfterReload());
  assert.equal(second.executionId, first.executionId);
  assert.equal(second.csrfFailureCode, 'csrf_denied');
  assert.equal(second.resumedTicketId, first.backgroundTicketId, 'Core restart + browser reload must preserve the exact outstanding ticket');
  assert.equal(second.state, 'SUCCESS');
  assert.ok(second.terminalArtifactId);

  await stopHttp(server); server = undefined;
  await production.close();
  production = await createProductionCore(config, { fetcher: forbiddenFetcher, testLocalModelsByCapability: testModels });
  server = await startHttp(production, fixture);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof globalThis.replayC5BBrowserAcceptanceAfterSecondReload === 'function', undefined, { timeout: 15_000 });
  const third = await page.evaluate(() => globalThis.replayC5BBrowserAcceptanceAfterSecondReload());
  assert.equal(third.executionId, first.executionId);
  assert.equal(third.state, 'SUCCESS');
  assert.equal(third.terminalArtifactId, second.terminalArtifactId);
  assert.equal(third.sessionStorageLength, 1);

  const continuation = await setupPool.query('SELECT state,terminal_artifact_id,completed_steps_json FROM workflow_continuations WHERE execution_id=$1', [first.executionId]);
  assert.equal(continuation.rowCount, 1);
  assert.equal(continuation.rows[0].state, 'SUCCESS');
  assert.equal(continuation.rows[0].terminal_artifact_id, second.terminalArtifactId);
  assert.deepEqual(continuation.rows[0].completed_steps_json.map(step => step.stepId), [
    'local-continuation-01-segment',
    'local-continuation-02-background-isolation',
    'local-continuation-03-verify',
  ]);
  const finalClaim = production.artifacts.external.resolveStoredFinalId(second.terminalArtifactId, scope);
  const finalRows = await setupPool.query("SELECT count(*)::int AS count, min(source_image_storage_id) AS source_image_storage_id, min(producer_operation) AS producer_operation FROM canonical_image_artifacts WHERE storage_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [finalClaim.storageId, first.executionId]);
  assert.equal(Number(finalRows.rows[0].count), 1, 'browser reconnect must publish exactly one canonical FINAL');
  assert.equal(finalRows.rows[0].source_image_storage_id, originalStorageId);
  assert.equal(finalRows.rows[0].producer_operation, 'BACKGROUND_ISOLATION');
  const afterCredits = Number((await setupPool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count);
  assert.equal(afterCredits, beforeCredits, 'LOCAL_ONLY browser reconnect must not create credit reservations');
  assert.equal(providerCalls, 0, 'LOCAL_ONLY browser reconnect must not invoke provider HTTP');
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.consoleErrors, []);
  assert.deepEqual(diagnostics.failedRequests, []);
  assert.deepEqual(diagnostics.failedResponses, []);
  console.log(JSON.stringify({
    authority: 'C5B_BROWSER_REFRESH_RECONNECT_ACCEPTED',
    browserProductVersion: version,
    executionId: first.executionId,
    backgroundTicketId: first.backgroundTicketId,
    terminalArtifactId: second.terminalArtifactId,
    csrfAfterReload: second.csrfFailureCode,
    coreRestarts: 2,
    providerCalls,
    creditReservationDelta: afterCredits - beforeCredits,
  }, null, 2));
} catch (error) {
  throw new Error(`C5B_BROWSER_RECONNECT_ACCEPTANCE_FAILED\n${JSON.stringify(diagnostics, null, 2)}\n${error instanceof Error ? error.stack ?? error.message : error}`);
} finally {
  await browser?.close();
  if (server) await stopHttp(server).catch(() => undefined);
  await production.close().catch(() => undefined);
  await setupPool.end();
}

async function startHttp(runtime, fixtureValue) {
  const ready = async () => { try { await runtime.transactions.pool.query('SELECT 1'); return true; } catch { return false; } };
  const canonical = createCanonicalNodeHttpAdapter({ core: runtime.core, artifacts: runtime.artifacts, projects: runtime.projects, auth: runtime.auth, config, ready, accepting: () => true });
  const outputs = new LocalCompositeOutputUploadService({ continuation: runtime.localExecution.composite, uploads: runtime.localExecution.uploads });
  const composite = createLocalCompositeContinuationHttpAdapter({ continuation: runtime.localExecution.composite, outputs, auth: runtime.auth, config });
  const contentTypes = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.map', 'application/json']]);
  const server = http.createServer((request, response) => {
    void (async () => {
      const requestPath = decodeURIComponent(new URL(request.url ?? '/', origin).pathname);
      if (requestPath.startsWith('/api/core/')) {
        applyCoreSecurityHeaders(response, config);
        if (requestPath.startsWith('/api/core/composite-continuations/')) { await composite(request, response); return; }
        await canonical(request, response); return;
      }
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      if (requestPath === '/__c5b-fixture.json') {
        const body = Buffer.from(JSON.stringify(fixtureValue));
        response.statusCode = 200; response.setHeader('Content-Type', 'application/json'); response.setHeader('Content-Length', body.byteLength); response.setHeader('Cache-Control', 'no-store'); response.end(body); return;
      }
      try {
        const file = path.resolve(outputDir, `.${requestPath}`);
        if (file !== outputDir && !file.startsWith(`${outputDir}${path.sep}`)) throw new Error('path traversal');
        const body = await fs.readFile(file);
        response.statusCode = 200; response.setHeader('Content-Type', contentTypes.get(path.extname(file)) ?? 'application/octet-stream'); response.setHeader('Content-Length', body.byteLength); response.setHeader('Cache-Control', 'no-store'); response.end(body);
      } catch {
        response.statusCode = 404; response.end('Not found');
      }
    })().catch(error => {
      if (response.headersSent) { response.destroy(error); return; }
      response.statusCode = 500; response.end('Internal test server error');
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}

async function stopHttp(server) {
  server.closeIdleConnections?.();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function rgbaPng(width, height, data) {
  return new Uint8Array(await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}

async function decodedRgba(bytes) {
  const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return Object.freeze({ width: decoded.info.width, height: decoded.info.height, data: new Uint8ClampedArray(decoded.data) });
}
