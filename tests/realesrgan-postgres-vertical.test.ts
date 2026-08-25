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
import { REAL_ESRGAN_UPSCALE_CAPABILITY } from '../src/platform/creative/super-resolution/SuperResolutionContract.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for C3 PostgreSQL vertical acceptance');

const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'must-not-be-called',
  falBaseUrl: 'https://provider.c3.invalid', jwtSecret: 'c3-jwt-secret', jwtIssuer: 'c3-test', jwtAudience: 'c3-core',
  artifactSigningSecret: 'c3-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 128_000, maskUploadLimitBytes: 128_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 2_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

const tenantId = 'c3-tenant';
const userId = 'c3-user';
const auth = Object.freeze({ tenantId, userId });
const modelBinding = Object.freeze({ kind: 'MODEL' as const, modelId: 'realesr-general-x4v3', version: '1.0.0-candidate.1' });
const testExecutors = Object.freeze({ [REAL_ESRGAN_UPSCALE_CAPABILITY]: Object.freeze([modelBinding]) });

function buildResult(ticket: LocalExecutionTicketV2, evidence: LocalExecutionOutputEvidence, executor = modelBinding): LocalExecutionResultV2 {
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: '2',
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    executor,
    runtime: 'WASM',
    accelerator: 'wasm',
    outputs: Object.freeze([evidence]),
    metrics: Object.freeze({ latencyMs: 17, memoryBytes: 12_000_000 }),
    benchmarkEvidence: Object.freeze({ acceptanceFixture: true, scale: 4 }),
  });
}

async function rgbaPng(width: number, height: number, data: Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}

async function decodedRgba(bytes: Uint8Array) {
  const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return Object.freeze({ width: decoded.info.width, height: decoded.info.height, data: new Uint8ClampedArray(decoded.data) });
}

function opaqueFixture(width: number, height: number, seed = 1): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    data[offset] = (seed + pixel * 13) & 255;
    data[offset + 1] = (seed * 3 + pixel * 17) & 255;
    data[offset + 2] = (seed * 7 + pixel * 19) & 255;
    data[offset + 3] = 255;
  }
  return data;
}

test('C3 production PostgreSQL vertical admits exact MODEL contract, survives restart and keeps Project explicit-accept authority', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-c3-realesrgan-vertical' });
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
  const forbiddenFetcher: typeof fetch = async () => {
    providerCalls += 1;
    throw new Error('C3 local model execution must not cross an external HTTP/provider boundary');
  };

  const sourceWidth = 2, sourceHeight = 2;
  const sourcePixels = opaqueFixture(sourceWidth, sourceHeight, 11);
  const sourcePng = await rgbaPng(sourceWidth, sourceHeight, sourcePixels);
  const candidateWidth = sourceWidth * 4, candidateHeight = sourceHeight * 4;
  const candidatePixels = opaqueFixture(candidateWidth, candidateHeight, 77);
  const candidatePng = await rgbaPng(candidateWidth, candidateHeight, candidatePixels);
  const wrongDimensionsPng = await rgbaPng(4, 4, opaqueFixture(4, 4, 3));
  const transparentPixels = Uint8ClampedArray.from(candidatePixels); transparentPixels[3] = 254;
  const transparentPng = await rgbaPng(candidateWidth, candidateHeight, transparentPixels);

  let production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 20_000, testLocalExecutorsByCapability: testExecutors });
  t.after(async () => { await production.close().catch(() => undefined); });

  const projectRow = await production.projects.create(auth, 'C3 Project', sourcePng, { maxDimension: 256, maxPixels: 65_536 });
  const scope = Object.freeze({ tenantId, userId, projectId: String(projectRow.project_id) });
  const originalId = production.artifacts.external.issueStoredOriginal(String(projectRow.original_image_storage_id), scope);
  const canonicalSource = await production.artifacts.images.loadSource(String(projectRow.original_image_storage_id), scope);
  assert.ok(canonicalSource);
  const canonicalPixels = await decodedRgba(canonicalSource.bytes);
  assert.deepEqual([canonicalPixels.width, canonicalPixels.height], [sourceWidth, sourceHeight]);
  for (let offset = 3; offset < canonicalPixels.data.length; offset += 4) assert.equal(canonicalPixels.data[offset], 255, 'C3 v1 source fixture must remain opaque');

  const prepare = async (clientRequestId: string) => (await production.localExecution.superResolution.prepare({
    projectId: scope.projectId,
    sourceArtifactId: originalId,
    clientRequestId,
  }, auth)).ticket;

  const ticket = await prepare('c3-success-and-retry');
  assert.equal(ticket.version, '2');
  assert.equal(ticket.operation.capability, REAL_ESRGAN_UPSCALE_CAPABILITY);
  assert.deepEqual(ticket.allowedExecutors, [modelBinding]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: candidateWidth, height: candidateHeight }]);
  assert.equal(ticket.inputs.length, 1);
  assert.equal(ticket.inputs[0].artifactId, originalId);
  assert.match(ticket.inputs[0].sha256 ?? '', /^[a-f0-9]{64}$/i);

  const wrongDimensionsTicket = await prepare('c3-wrong-dimensions');
  await assert.rejects(
    () => production.localExecution.superResolution.uploadImage({ ticketId: wrongDimensionsTicket.ticketId, projectId: scope.projectId, bytes: wrongDimensionsPng }, auth),
    (error: any) => error?.code === 'local_image_dimensions_mismatch',
  );

  const transparentTicket = await prepare('c3-transparent-output');
  await assert.rejects(
    () => production.localExecution.superResolution.uploadImage({ ticketId: transparentTicket.ticketId, projectId: scope.projectId, bytes: transparentPng }, auth),
    (error: any) => error?.code === 'local_output_alpha_policy_mismatch',
  );

  const wrongModelTicket = await prepare('c3-wrong-model');
  const wrongModelEvidence = await production.localExecution.superResolution.uploadImage({ ticketId: wrongModelTicket.ticketId, projectId: scope.projectId, bytes: candidatePng }, auth);
  await assert.rejects(
    () => production.localExecution.superResolution.submit({
      ticketId: wrongModelTicket.ticketId,
      projectId: scope.projectId,
      result: buildResult(wrongModelTicket, wrongModelEvidence, Object.freeze({ kind: 'MODEL', modelId: 'other-model', version: '1' })),
    }, auth),
    (error: any) => error?.code === 'local_result_executor_mismatch',
    'MODEL identity must be exact ticket authority, not client-selected',
  );

  const otherProject = await production.projects.create(auth, 'Other C3 Project', sourcePng, { maxDimension: 256, maxPixels: 65_536 });
  const otherScope = Object.freeze({ tenantId, userId, projectId: String(otherProject.project_id) });
  const otherOriginalId = production.artifacts.external.issueStoredOriginal(String(otherProject.original_image_storage_id), otherScope);
  await assert.rejects(
    () => production.localExecution.superResolution.prepare({ projectId: scope.projectId, sourceArtifactId: otherOriginalId, clientRequestId: 'c3-cross-project' }, auth),
    (error: any) => error?.code === 'artifact_scope_denied',
    'cross-project canonical IMAGE identity must be denied before ticket issuance',
  );

  const correctEvidence = await production.localExecution.superResolution.uploadImage({ ticketId: ticket.ticketId, projectId: scope.projectId, bytes: candidatePng }, auth);
  const tamperedEvidence = Object.freeze({ ...correctEvidence, sha256: 'f'.repeat(64) });
  await assert.rejects(
    () => production.localExecution.superResolution.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result: buildResult(ticket, tamperedEvidence) }, auth),
    (error: any) => error?.code === 'local_upload_evidence_mismatch',
    'quarantine bytes must remain authoritative over client evidence',
  );
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE project_id=$1 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId])).rows[0].count), 0, 'failed candidate evidence must not publish FINAL');

  const result = buildResult(ticket, correctEvidence);
  const success = await production.localExecution.superResolution.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(success.status, 'SUCCESS');
  assert.ok(success.artifactId);
  assert.equal(success.outcome.verification.valid, true);
  assert.equal(success.outcome.verification.checks.includes('LOCAL_MODEL_CONTRACT_ADMITTED'), true);
  assert.equal(success.outcome.verification.checks.includes('DETERMINISTIC_PIXELS_VERIFIED'), false);
  const admitted = success.outcome.artifacts.find(value => value.producerOperationId === 'super-resolution');
  assert.ok(admitted);
  assert.equal(admitted.metadata?.admissionClass, 'MODEL_CONTRACT');
  assert.equal(admitted.metadata?.verificationScope, 'CONTRACT_AND_LINEAGE_ONLY');
  assert.equal(admitted.metadata?.modelOutputSemantics, 'UNATTESTED_DEVICE_INFERENCE');
  assert.equal(admitted.metadata?.integrityMetrics, undefined, 'ML candidate must not fabricate deterministic integrity proof');

  const finalClaim = production.artifacts.external.resolveStoredFinalId(success.artifactId!, scope);
  const finalRows = await pool.query("SELECT * FROM canonical_image_artifacts WHERE project_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId, ticket.requestId]);
  assert.equal(finalRows.rowCount, 1, 'accepted model contract must publish exactly one canonical FINAL');
  assert.equal(finalRows.rows[0].storage_id, finalClaim.storageId);
  const finalPixels = await decodedRgba(new Uint8Array(finalRows.rows[0].image_bytes));
  assert.deepEqual([...finalPixels.data], [...candidatePixels], 'persisted FINAL must be the admitted quarantined candidate pixels');

  const beforeAccept = await production.projects.get(auth, scope.projectId);
  assert.equal(beforeAccept.current_image_storage_id, projectRow.original_image_storage_id, 'Project current image must remain unchanged before explicit accept-final');
  assert.equal(providerCalls, 0, 'C3 local MODEL path must make zero external provider/API calls');
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0, 'C3 local MODEL path must reserve zero paid credits');

  await production.close();
  production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 21_000, testLocalExecutorsByCapability: testExecutors });
  const replay = await production.localExecution.superResolution.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(replay.status, 'SUCCESS');
  assert.equal(replay.artifactId, success.artifactId, 'replay after Core recreation must return the same canonical FINAL identity');
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE project_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId, ticket.requestId])).rows[0].count), 1, 'restart replay must not duplicate canonical publication');
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);

  await production.projects.acceptFinal(auth, scope.projectId, finalClaim.storageId, 'Accept local super-resolution');
  const afterAccept = await production.projects.get(auth, scope.projectId);
  assert.equal(afterAccept.current_image_storage_id, finalClaim.storageId, 'existing explicit accept-final boundary owns Project mutation');
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND kind='ACCEPTED_FINAL' AND retired_at IS NULL", [scope.projectId])).rows[0].count), 1);
});
