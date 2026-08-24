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
import { isolateBackgroundRgba } from '../src/platform/creative/deterministic/BackgroundIsolation.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for C2 PostgreSQL vertical acceptance');

const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'must-not-be-called',
  falBaseUrl: 'https://provider.c2.invalid', jwtSecret: 'c2-jwt-secret', jwtIssuer: 'c2-test', jwtAudience: 'c2-core',
  artifactSigningSecret: 'c2-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 128_000, maskUploadLimitBytes: 128_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 2_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

const tenantId = 'c2-tenant';
const userId = 'c2-user';
const auth = Object.freeze({ tenantId, userId });

function buildResult(ticket: LocalExecutionTicketV2, evidence: LocalExecutionOutputEvidence): LocalExecutionResultV2 {
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: '2',
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    executor: Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' }),
    runtime: 'BROWSER_JS',
    accelerator: 'cpu',
    outputs: Object.freeze([evidence]),
    metrics: Object.freeze({ latencyMs: 3 }),
    benchmarkEvidence: Object.freeze({ pixelCount: 16, deterministicTool: 'background-isolation@1' }),
  });
}

async function rgbaPng(width: number, height: number, data: Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}

async function decodedRgba(bytes: Uint8Array) {
  const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return Object.freeze({ width: decoded.info.width, height: decoded.info.height, data: new Uint8ClampedArray(decoded.data) });
}

test('C2 production PostgreSQL vertical verifies exact pixels, lineage, replay and zero-cloud authority', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-c2-background-isolation-vertical' });
  await migrateTransactionSchema(pool);
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts,local_execution_uploads,local_execution_tickets,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts,local_execution_uploads,local_execution_tickets,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE').catch(() => undefined);
    await pool.end();
  });

  let providerCalls = 0;
  const forbiddenFetcher: typeof fetch = async () => {
    providerCalls += 1;
    throw new Error('C2 deterministic local execution must not cross an external HTTP/provider boundary');
  };

  const width = 4, height = 4;
  const originalPixels = new Uint8ClampedArray([
    11,21,31,255, 12,22,32,200, 13,23,33,128, 14,24,34,0,
    41,51,61,255, 42,52,62,220, 43,53,63,100, 44,54,64,1,
    71,81,91,255, 72,82,92,180, 73,83,93,64, 74,84,94,10,
    101,111,121,255, 102,112,122,160, 103,113,123,32, 104,114,124,0,
  ]);
  const upload = await rgbaPng(width, height, originalPixels);
  const maskAlpha = new Uint8Array([255,128,0,255, 64,255,128,0, 255,200,32,255, 1,254,127,255]);

  let production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 10_000 });
  t.after(async () => { await production.close().catch(() => undefined); });

  const projectRow = await production.projects.create(auth, 'C2 Project', upload, { maxDimension: 256, maxPixels: 65_536 });
  const scope = Object.freeze({ tenantId, userId, projectId: String(projectRow.project_id) });
  const originalId = production.artifacts.external.issueStoredOriginal(String(projectRow.original_image_storage_id), scope);
  const canonicalSource = await production.artifacts.images.loadSource(String(projectRow.original_image_storage_id), scope);
  assert.ok(canonicalSource);
  const canonicalPixels = await decodedRgba(canonicalSource.bytes);
  assert.deepEqual([canonicalPixels.width, canonicalPixels.height], [width, height]);

  const storedMask = await production.artifacts.masks.persistManual(scope, width, height, maskAlpha, { sourceImageStorageId: String(projectRow.original_image_storage_id), producerOperation: 'MANUAL_SELECTION' });
  const maskId = production.artifacts.external.issueStoredMask(storedMask.storageId, scope);

  const prepared = await production.localExecution.deterministicImages.prepareBackgroundIsolation({ projectId: scope.projectId, sourceArtifactId: originalId, maskArtifactId: maskId, clientRequestId: 'c2-success-and-retry' }, auth);
  const ticket = prepared.ticket;
  assert.equal(ticket.version, '2');
  assert.equal(ticket.operation.capability, 'local:tool:background-isolation:v1');
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.deepEqual(ticket.allowedExecutors, [{ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' }]);

  const expected = isolateBackgroundRgba(canonicalPixels.data, maskAlpha, width, height);
  for (let index = 0; index < expected.length; index += 4) {
    assert.equal(expected[index], canonicalPixels.data[index]);
    assert.equal(expected[index + 1], canonicalPixels.data[index + 1]);
    assert.equal(expected[index + 2], canonicalPixels.data[index + 2]);
  }
  assert.equal(expected[7], Math.floor((canonicalPixels.data[7] * maskAlpha[1] + 127) / 255), 'source alpha and mask alpha must use the exact integer law');

  const wrongRgb = Uint8ClampedArray.from(expected); wrongRgb[0] ^= 1;
  const wrongRgbEvidence = await production.localExecution.deterministicImages.uploadImage({ ticketId: ticket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(width, height, wrongRgb) }, auth);
  await assert.rejects(
    () => production.localExecution.deterministicImages.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result: buildResult(ticket, wrongRgbEvidence) }, auth),
    (error: any) => error?.code === 'local_pixel_verification_failed',
    'one RGB byte mismatch must prevent canonical publication',
  );
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE project_id=$1 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId])).rows[0].count), 0);

  const wrongAlpha = Uint8ClampedArray.from(expected); wrongAlpha[3] = (wrongAlpha[3] + 1) & 255;
  const wrongAlphaEvidence = await production.localExecution.deterministicImages.uploadImage({ ticketId: ticket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(width, height, wrongAlpha) }, auth);
  await assert.rejects(
    () => production.localExecution.deterministicImages.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result: buildResult(ticket, wrongAlphaEvidence) }, auth),
    (error: any) => error?.code === 'local_pixel_verification_failed',
    'one alpha byte mismatch must prevent canonical publication',
  );

  const wrongDimensions = await rgbaPng(1, 1, new Uint8ClampedArray([1,2,3,4]));
  await assert.rejects(
    () => production.localExecution.deterministicImages.uploadImage({ ticketId: ticket.ticketId, projectId: scope.projectId, bytes: wrongDimensions }, auth),
    (error: any) => error?.code === 'local_image_dimensions_mismatch',
  );

  // Same project and same geometry are insufficient: a MASK lineaged to another
  // source IMAGE must not be admitted against the ORIGINAL.
  const alternatePixels = Uint8ClampedArray.from(canonicalPixels.data); alternatePixels[1] ^= 7;
  const alternate = await production.artifacts.images.persistFinal(scope, 'alternate-source-execution', 'alternate-source-operation', { width, height, data: alternatePixels });
  const alternateMask = await production.artifacts.masks.persistManual(scope, width, height, maskAlpha, { sourceImageStorageId: alternate.storageId, producerOperation: 'MANUAL_SELECTION' });
  const alternateMaskId = production.artifacts.external.issueStoredMask(alternateMask.storageId, scope);
  await assert.rejects(
    () => production.localExecution.deterministicImages.prepareBackgroundIsolation({ projectId: scope.projectId, sourceArtifactId: originalId, maskArtifactId: alternateMaskId, clientRequestId: 'c2-wrong-source-lineage' }, auth),
    (error: any) => error?.code === 'local_input_lineage_unavailable',
    'same-size MASK from another canonical source must be denied',
  );

  const otherProject = await production.projects.create(auth, 'Other C2 Project', upload, { maxDimension: 256, maxPixels: 65_536 });
  const otherScope = Object.freeze({ tenantId, userId, projectId: String(otherProject.project_id) });
  const otherMask = await production.artifacts.masks.persistManual(otherScope, width, height, maskAlpha, { sourceImageStorageId: String(otherProject.original_image_storage_id), producerOperation: 'MANUAL_SELECTION' });
  const otherMaskId = production.artifacts.external.issueStoredMask(otherMask.storageId, otherScope);
  await assert.rejects(
    () => production.localExecution.deterministicImages.prepareBackgroundIsolation({ projectId: scope.projectId, sourceArtifactId: originalId, maskArtifactId: otherMaskId, clientRequestId: 'c2-cross-project' }, auth),
    (error: any) => error?.code === 'artifact_scope_denied',
    'cross-project MASK identity must be denied before execution',
  );

  const correctEvidence = await production.localExecution.deterministicImages.uploadImage({ ticketId: ticket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(width, height, expected) }, auth);
  const result = buildResult(ticket, correctEvidence);
  const success = await production.localExecution.deterministicImages.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(success.status, 'SUCCESS');
  assert.ok(success.artifactId);
  const finalClaim = production.artifacts.external.resolveStoredFinalId(success.artifactId!, scope);
  const finalRows = await pool.query("SELECT * FROM canonical_image_artifacts WHERE project_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId, ticket.requestId]);
  assert.equal(finalRows.rowCount, 1, 'verified execution must publish exactly one canonical FINAL');
  assert.equal(finalRows.rows[0].storage_id, finalClaim.storageId);
  const finalPixels = await decodedRgba(new Uint8Array(finalRows.rows[0].image_bytes));
  assert.deepEqual([...finalPixels.data], [...expected], 'persisted FINAL must be Core-recomputed RGBA, not trusted client pixels');

  const beforeAccept = await production.projects.get(auth, scope.projectId);
  assert.equal(beforeAccept.current_image_storage_id, projectRow.original_image_storage_id, 'Project current image must remain unchanged before explicit accept-final');
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND retired_at IS NULL', [scope.projectId])).rows[0].count), 1);
  assert.equal(providerCalls, 0, 'deterministic C2 must make zero external provider/API calls');
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0, 'deterministic C2 must reserve zero paid credits');

  // Recreate the production composition to prove durable ticket/finalization replay.
  await production.close();
  production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 11_000 });
  const replay = await production.localExecution.deterministicImages.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(replay.status, 'SUCCESS');
  assert.equal(replay.artifactId, success.artifactId, 'replay after Core restart must return the same canonical FINAL identity');
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE project_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId, ticket.requestId])).rows[0].count), 1, 'restart replay must not duplicate canonical publication');
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);

  await production.projects.acceptFinal(auth, scope.projectId, finalClaim.storageId, 'Accept deterministic background isolation');
  const afterAccept = await production.projects.get(auth, scope.projectId);
  assert.equal(afterAccept.current_image_storage_id, finalClaim.storageId, 'existing explicit accept-final boundary owns Project mutation');
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND kind='ACCEPTED_FINAL' AND retired_at IS NULL", [scope.projectId])).rows[0].count), 1);
});
