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
import { maskedWhiteBalanceRgba8 } from '../src/platform/creative/deterministic/MaskedWhiteBalance.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Masked White Balance PostgreSQL acceptance');

const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'must-not-be-called',
  falBaseUrl: 'https://provider.masked-white-balance.invalid', jwtSecret: 'masked-white-balance-jwt-secret', jwtIssuer: 'masked-white-balance-test', jwtAudience: 'masked-white-balance-core',
  authChallengeSecret: '', authDefaultTenantId: '', authPublicOrigin: '', authSessionAbsoluteTtlMs: 8 * 60 * 60 * 1000, authSessionIdleTtlMs: 30 * 60 * 1000,
  resendApiKey: '', authEmailFrom: '', googleOauthClientId: '', googleOauthClientSecret: '',
  artifactSigningSecret: 'masked-white-balance-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 128_000, maskUploadLimitBytes: 128_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 2_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

const tenantId = 'masked-white-balance-tenant';
const userId = 'masked-white-balance-user';
const auth = Object.freeze({ tenantId, userId });

async function rgbaPng(width: number, height: number, data: Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}
async function decodedRgba(bytes: Uint8Array) {
  const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return Object.freeze({ width: decoded.info.width, height: decoded.info.height, data: new Uint8ClampedArray(decoded.data) });
}
function buildResult(ticket: LocalExecutionTicketV2, evidence: LocalExecutionOutputEvidence, temperatureQ8: number, tintQ8: number): LocalExecutionResultV2 {
  const width = Number(ticket.expectedOutputs[0].width);
  const height = Number(ticket.expectedOutputs[0].height);
  return Object.freeze({
    ticketId: ticket.ticketId, ticketVersion: '2', requestId: ticket.requestId, workflowId: ticket.workflowId, stepId: ticket.stepId, nonce: ticket.nonce,
    executor: Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'masked-white-balance', version: '1' }), runtime: 'BROWSER_JS', accelerator: 'cpu',
    outputs: Object.freeze([evidence]), metrics: Object.freeze({ latencyMs: 2 }),
    benchmarkEvidence: Object.freeze({ pixelCount: width * height, deterministicTool: 'masked-white-balance@1', temperatureQ8, tintQ8 }),
  });
}

test('Masked White Balance PostgreSQL vertical persists one exact IMAGE+MASK FINAL with zero Provider/Billing authority', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-masked-white-balance-vertical' });
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
  const forbiddenFetcher: typeof fetch = async () => { providerCalls += 1; throw new Error('Masked White Balance must not cross an external provider boundary'); };

  const width = 3, height = 2;
  const originalPixels = new Uint8ClampedArray([
    10,20,30,255, 100,120,200,128, 250,100,50,0,
    40,80,160,64, 200,100,50,255, 1,2,3,0,
  ]);
  const originalPng = await rgbaPng(width, height, originalPixels);

  let production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 70_000 });
  t.after(async () => { await production.close().catch(() => undefined); });
  const projectRow = await production.projects.create(auth, 'Masked White Balance Project', originalPng, { maxDimension: 256, maxPixels: 65_536 });
  const scope = Object.freeze({ tenantId, userId, projectId: String(projectRow.project_id) });
  const originalStorageId = String(projectRow.original_image_storage_id);
  const originalId = production.artifacts.external.issueStoredOriginal(originalStorageId, scope);
  const storedSource = await production.artifacts.images.loadSource(originalStorageId, scope);
  assert.ok(storedSource);
  const canonicalSource = await decodedRgba(storedSource.bytes);

  const maskAlpha = new Uint8Array([255, 128, 0, 255, 64, 200]);
  const storedMask = await production.artifacts.masks.persistManual(scope, width, height, maskAlpha, {
    sourceImageStorageId: originalStorageId,
    producerOperation: 'MANUAL_SELECTION',
  });
  const maskId = production.artifacts.external.issueStoredMask(storedMask.storageId, scope);
  const temperatureQ8 = 64;
  const tintQ8 = 32;

  const prepared = await production.localExecution.maskedWhiteBalance.prepare({
    projectId: scope.projectId,
    sourceArtifactId: originalId,
    maskArtifactId: maskId,
    temperatureQ8,
    tintQ8,
    clientRequestId: 'masked-white-balance-success',
  }, auth);
  const ticket = prepared.ticket;
  assert.equal(ticket.operation.capability, 'local:tool:masked-white-balance:v1');
  assert.deepEqual(ticket.allowedExecutors, [{ kind: 'DETERMINISTIC_TOOL', toolId: 'masked-white-balance', version: '1' }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width, height }]);
  assert.deepEqual(ticket.operation.parameters, {
    sourceArtifactId: originalId,
    maskArtifactId: maskId,
    temperatureQ8,
    tintQ8,
    deterministicTool: 'masked-white-balance@1',
    coordinateSpace: 'CANONICAL_ORIENTATION_1_RGBA8_PLUS_ALPHA8_MASK',
    transferDomain: 'SRGB_ENCODED_BYTE_DOMAIN',
    parameterEncoding: 'SIGNED_Q8_RELATIVE_CHANNEL_BALANCE',
    parameterFractionBits: 8,
    gainEncoding: 'Q16_16_DERIVED_INTEGER',
    gainFixedPointBits: 16,
    temperatureLaw: 'RED_PLUS_BLUE_MINUS_EQUAL_Q8',
    tintLaw: 'MAGENTA_PLUS_HALF_GREEN_MINUS_FULL_Q8',
    gainRounding: 'ROUND_HALF_UP',
    maskBlend: 'SOURCE_ADJUSTED_ALPHA8_ROUND_HALF_UP',
    alphaPolicy: 'COPY_SOURCE_ALPHA_BYTES',
  });

  const delivered = await production.localExecution.inputDelivery.maskedWhiteBalance({ ticketId: ticket.ticketId, projectId: scope.projectId }, auth);
  assert.equal(delivered.sourceArtifactId, originalId);
  assert.equal(delivered.maskArtifactId, maskId);
  assert.deepEqual([...delivered.sourceRgba], [...canonicalSource.data]);
  assert.deepEqual([...delivered.maskAlpha], [...maskAlpha]);

  const expected = maskedWhiteBalanceRgba8(canonicalSource.data, maskAlpha, width, height, temperatureQ8, tintQ8);
  const wrong = Uint8ClampedArray.from(expected); wrong[0] ^= 1;
  const wrongPrepared = await production.localExecution.maskedWhiteBalance.prepare({
    projectId: scope.projectId, sourceArtifactId: originalId, maskArtifactId: maskId, temperatureQ8, tintQ8, clientRequestId: 'masked-white-balance-wrong',
  }, auth);
  const wrongEvidence = await production.localExecution.maskedWhiteBalance.uploadImage({
    ticketId: wrongPrepared.ticket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(width, height, wrong),
  }, auth);
  await assert.rejects(
    () => production.localExecution.maskedWhiteBalance.submit({
      ticketId: wrongPrepared.ticket.ticketId,
      projectId: scope.projectId,
      result: buildResult(wrongPrepared.ticket, wrongEvidence, temperatureQ8, tintQ8),
    }, auth),
    (error: any) => /pixel|RGBA byte/i.test(String(error?.message ?? '')),
    'one mismatching pixel byte must block Masked White Balance FINAL publication',
  );

  const evidence = await production.localExecution.maskedWhiteBalance.uploadImage({
    ticketId: ticket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(width, height, expected),
  }, auth);
  const result = buildResult(ticket, evidence, temperatureQ8, tintQ8);
  const success = await production.localExecution.maskedWhiteBalance.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(success.status, 'SUCCESS');
  assert.ok(success.artifactId);

  const finalClaim = production.artifacts.external.resolveStoredFinalId(success.artifactId!, scope);
  const finalRows = await pool.query("SELECT * FROM canonical_image_artifacts WHERE project_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId, ticket.requestId]);
  assert.equal(finalRows.rowCount, 1);
  assert.equal(finalRows.rows[0].storage_id, finalClaim.storageId);
  assert.equal(finalRows.rows[0].source_image_storage_id, originalStorageId);
  assert.equal(finalRows.rows[0].mask_storage_id, storedMask.storageId);
  assert.equal(finalRows.rows[0].producer_operation, 'MASKED_WHITE_BALANCE');
  const finalPixels = await decodedRgba(new Uint8Array(finalRows.rows[0].image_bytes));
  assert.deepEqual([...finalPixels.data], [...expected]);

  const shape = await pool.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=to_regclass('canonical_image_artifacts') AND conname='canonical_image_artifacts_lineage_shape_check'");
  assert.match(String(shape.rows[0]?.definition ?? ''), /MASKED_EXPOSURE/);
  assert.match(String(shape.rows[0]?.definition ?? ''), /MASKED_WHITE_BALANCE/);
  assert.match(String(shape.rows[0]?.definition ?? ''), /GARMENT_TEXTURE_COMPOSITE/);

  const beforeAccept = await production.projects.get(auth, scope.projectId);
  assert.equal(beforeAccept.current_image_storage_id, originalStorageId, 'Masked White Balance publication must not mutate Project current image');
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);

  await production.close();
  production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 71_000 });
  const replay = await production.localExecution.maskedWhiteBalance.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(replay.status, 'SUCCESS');
  assert.equal(replay.artifactId, success.artifactId);
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE project_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId, ticket.requestId])).rows[0].count), 1);
  assert.equal(providerCalls, 0);
});
