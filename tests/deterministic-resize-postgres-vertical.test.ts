import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createProductionCore } from '../server/core/composition/createProductionCore.ts';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateMaskArtifactSchema } from '../server/core/artifacts/maskArtifactSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import type { LocalExecutionOutputEvidence, LocalExecutionResultV2, LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';
import { resizeRgba8 } from '../src/platform/creative/deterministic/Resize.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for deterministic Resize PostgreSQL acceptance');

const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'must-not-be-called',
  falBaseUrl: 'https://provider.resize.invalid', jwtSecret: 'resize-jwt-secret', jwtIssuer: 'resize-test', jwtAudience: 'resize-core',
  authChallengeSecret: '', authDefaultTenantId: '', authPublicOrigin: '', authSessionAbsoluteTtlMs: 8 * 60 * 60 * 1000, authSessionIdleTtlMs: 30 * 60 * 1000,
  resendApiKey: '', authEmailFrom: '', googleOauthClientId: '', googleOauthClientSecret: '',
  artifactSigningSecret: 'resize-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 128_000, maskUploadLimitBytes: 128_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 2_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

const tenantId = 'resize-tenant';
const userId = 'resize-user';
const auth = Object.freeze({ tenantId, userId });
const target = Object.freeze({ width: 5, height: 3 });

function buildResult(ticket: LocalExecutionTicketV2, evidence: LocalExecutionOutputEvidence): LocalExecutionResultV2 {
  return Object.freeze({
    ticketId: ticket.ticketId, ticketVersion: '2', requestId: ticket.requestId, workflowId: ticket.workflowId, stepId: ticket.stepId, nonce: ticket.nonce,
    executor: Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'resize', version: '1' }), runtime: 'BROWSER_JS', accelerator: 'cpu',
    outputs: Object.freeze([evidence]), metrics: Object.freeze({ latencyMs: 3 }), benchmarkEvidence: Object.freeze({ pixelCount: target.width * target.height, deterministicTool: 'resize@1' }),
  });
}

async function rgbaPng(width: number, height: number, data: Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}
async function decodedRgba(bytes: Uint8Array) {
  const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return Object.freeze({ width: decoded.info.width, height: decoded.info.height, data: new Uint8ClampedArray(decoded.data) });
}

test('deterministic Resize PostgreSQL vertical rejects tamper/scope/rebind and publishes one source-lineaged zero-cloud FINAL with restart replay', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-deterministic-resize-vertical' });
  await migrateTransactionSchema(pool);
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts,local_execution_uploads,local_execution_tickets,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE').catch(() => undefined);
    await pool.end();
  });

  let providerCalls = 0;
  const forbiddenFetcher: typeof fetch = async () => { providerCalls += 1; throw new Error('deterministic Resize must not cross an external provider boundary'); };
  const sourceWidth = 3, sourceHeight = 2;
  const originalPixels = new Uint8ClampedArray([
    255,0,0,255, 0,255,0,128, 30,40,50,0,
    0,0,255,64, 240,220,20,255, 90,80,70,0,
  ]);
  const originalPng = await rgbaPng(sourceWidth, sourceHeight, originalPixels);

  let production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 30_000 });
  t.after(async () => { await production.close().catch(() => undefined); });
  const projectRow = await production.projects.create(auth, 'Resize Project', originalPng, { maxDimension: 256, maxPixels: 65_536 });
  const scope = Object.freeze({ tenantId, userId, projectId: String(projectRow.project_id) });
  const originalStorageId = String(projectRow.original_image_storage_id);
  const originalId = production.artifacts.external.issueStoredOriginal(originalStorageId, scope);
  const storedSource = await production.artifacts.images.loadSource(originalStorageId, scope);
  assert.ok(storedSource);
  const canonicalSource = await decodedRgba(storedSource.bytes);

  const prepare = async (clientRequestId: string, patch: Partial<typeof target> = {}) => production.localExecution.resize.prepare({ projectId: scope.projectId, sourceArtifactId: originalId, clientRequestId, ...target, ...patch }, auth);
  const prepared = await prepare('resize-success-replay');
  const ticket = prepared.ticket;
  assert.equal(ticket.operation.capability, 'local:tool:resize:v1');
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: target.width, height: target.height }]);
  assert.deepEqual(ticket.allowedExecutors, [{ kind: 'DETERMINISTIC_TOOL', toolId: 'resize', version: '1' }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.deepEqual(ticket.operation.parameters, {
    sourceArtifactId: originalId, width: target.width, height: target.height, deterministicTool: 'resize@1',
    coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_CENTERS', interpolation: 'BILINEAR_FIXED_16_16_PIXEL_CENTER', fixedPointBits: 16,
    rounding: 'ROUND_HALF_UP', borderPolicy: 'CLAMP_TO_EDGE', alphaPolicy: 'PREMULTIPLIED_ALPHA_WITH_STRAIGHT_RGB_WHEN_WEIGHTED_ALPHA_ZERO', maxOutputPixels: 16_777_216,
  });

  const delivered = await production.localExecution.inputDelivery.resize({ ticketId: ticket.ticketId, projectId: scope.projectId }, auth);
  assert.equal(delivered.sourceArtifactId, originalId);
  assert.deepEqual([delivered.width, delivered.height], [sourceWidth, sourceHeight]);
  assert.deepEqual([...delivered.sourceRgba], [...canonicalSource.data]);

  await assert.rejects(
    () => prepare('resize-success-replay', { width: 4 }),
    (error: any) => error?.code === 'local_execution_idempotency_mismatch',
    'same clientRequestId cannot be rebound to another target geometry',
  );
  await assert.rejects(
    () => prepare('resize-hostile-target', { width: 8192, height: 8192 }),
    (error: any) => error?.code === 'invalid_resize_request',
    'Resize v1 hard output-pixel ceiling must be enforced before ticket publication',
  );

  const otherProject = await production.projects.create(auth, 'Other Resize Project', originalPng, { maxDimension: 256, maxPixels: 65_536 });
  const otherScope = Object.freeze({ tenantId, userId, projectId: String(otherProject.project_id) });
  const otherOriginalId = production.artifacts.external.issueStoredOriginal(String(otherProject.original_image_storage_id), otherScope);
  await assert.rejects(
    () => production.localExecution.resize.prepare({ projectId: scope.projectId, sourceArtifactId: otherOriginalId, clientRequestId: 'resize-cross-project', ...target }, auth),
    (error: any) => error?.code === 'artifact_scope_denied',
  );

  const expected = resizeRgba8(canonicalSource.data, sourceWidth, sourceHeight, target);
  const wrongTicket = (await prepare('resize-wrong-byte')).ticket;
  const wrong = Uint8ClampedArray.from(expected); wrong[0] ^= 1;
  const wrongEvidence = await production.localExecution.resize.uploadImage({ ticketId: wrongTicket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(target.width, target.height, wrong) }, auth);
  await assert.rejects(
    () => production.localExecution.resize.submit({ ticketId: wrongTicket.ticketId, projectId: scope.projectId, result: buildResult(wrongTicket, wrongEvidence) }, auth),
    (error: any) => error?.code === 'local_resize_pixel_mismatch',
    'one candidate byte mismatch must block canonical Resize publication',
  );

  const wrongDimensionsTicket = (await prepare('resize-wrong-dimensions')).ticket;
  await assert.rejects(
    async () => production.localExecution.resize.uploadImage({ ticketId: wrongDimensionsTicket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(1, 1, new Uint8ClampedArray([1,2,3,4])) }, auth),
    (error: any) => error?.code === 'local_image_dimensions_mismatch',
  );

  const evidence = await production.localExecution.resize.uploadImage({ ticketId: ticket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(target.width, target.height, expected) }, auth);
  const result = buildResult(ticket, evidence);
  const success = await production.localExecution.resize.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(success.status, 'SUCCESS');
  assert.ok(success.artifactId);
  const finalClaim = production.artifacts.external.resolveStoredFinalId(success.artifactId!, scope);
  const finalRows = await pool.query("SELECT * FROM canonical_image_artifacts WHERE project_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId, ticket.requestId]);
  assert.equal(finalRows.rowCount, 1);
  assert.equal(finalRows.rows[0].storage_id, finalClaim.storageId);
  assert.equal(finalRows.rows[0].source_image_storage_id, originalStorageId);
  assert.equal(finalRows.rows[0].mask_storage_id, null);
  assert.equal(finalRows.rows[0].producer_operation, 'RESIZE');
  const finalPixels = await decodedRgba(new Uint8Array(finalRows.rows[0].image_bytes));
  assert.deepEqual([finalPixels.width, finalPixels.height], [target.width, target.height]);
  assert.deepEqual([...finalPixels.data], [...expected]);

  const beforeAccept = await production.projects.get(auth, scope.projectId);
  assert.equal(beforeAccept.current_image_storage_id, originalStorageId, 'Resize publication must not mutate Project current image');
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);

  await production.close();
  production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 31_000 });
  const replay = await production.localExecution.resize.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(replay.status, 'SUCCESS');
  assert.equal(replay.artifactId, success.artifactId);
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE project_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId, ticket.requestId])).rows[0].count), 1);
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);

  await production.projects.acceptFinal(auth, scope.projectId, finalClaim.storageId, 'Accept deterministic Resize');
  const afterAccept = await production.projects.get(auth, scope.projectId);
  assert.equal(afterAccept.current_image_storage_id, finalClaim.storageId);
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND kind='ACCEPTED_FINAL' AND retired_at IS NULL", [scope.projectId])).rows[0].count), 1);
});