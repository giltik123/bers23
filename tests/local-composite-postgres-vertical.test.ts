import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createProductionCore } from '../server/core/composition/createProductionCore.ts';
import { migrateFinalImageLineageSchema } from '../server/core/artifacts/finalImageLineageSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { MOBILE_SAM_LOCAL_CAPABILITY } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../src/platform/creative/canonical/localComposite.ts';
import type { LocalExecutionOutputEvidence, LocalExecutionResult, LocalExecutionResultV2, LocalExecutionTicket, LocalExecutionTicketV2 } from '../src/platform/creative/canonical/localExecution.ts';
import { isolateBackgroundRgba } from '../src/platform/creative/deterministic/BackgroundIsolation.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for C5B PostgreSQL vertical acceptance');

const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'must-not-be-called',
  falBaseUrl: 'https://provider.c5b.invalid', jwtSecret: 'c5b-jwt-secret', jwtIssuer: 'c5b-test', jwtAudience: 'c5b-core',
  artifactSigningSecret: 'c5b-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 128_000, maskUploadLimitBytes: 128_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 2_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

const tenantId = 'c5b-composite-tenant';
const userId = 'c5b-composite-user';
const auth = Object.freeze({ tenantId, userId });
const testMobileSam = Object.freeze({ modelId: 'mobilesam-vit-t', version: '1.0.2' });
const testMobileSamBindings = Object.freeze([testMobileSam]);
const testModels = Object.freeze({
  [MOBILE_SAM_LOCAL_CAPABILITY]: testMobileSamBindings,
  [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment]: testMobileSamBindings,
});
const analysis = Object.freeze({ originalWidth: 4, originalHeight: 4, analysisWidth: 4, analysisHeight: 4, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
const points = Object.freeze([Object.freeze({ x: 1, y: 1, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' })]);

function v1Result(ticket: LocalExecutionTicket, evidence: LocalExecutionOutputEvidence): LocalExecutionResult {
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: '1',
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    model: ticket.allowedModels[0],
    runtime: 'WASM',
    accelerator: 'wasm',
    outputs: Object.freeze([evidence]),
    metrics: Object.freeze({ latencyMs: 7 }),
  });
}

function v2Result(ticket: LocalExecutionTicketV2, evidence: LocalExecutionOutputEvidence): LocalExecutionResultV2 {
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

function evidenceFrom(upload: Readonly<{ uploadId: string; kind: string; role: string; sha256: string; sizeBytes: number; mimeType: string; width?: number; height?: number }>): LocalExecutionOutputEvidence {
  return Object.freeze({
    uploadId: upload.uploadId,
    kind: upload.kind,
    role: upload.role,
    sha256: upload.sha256,
    sizeBytes: upload.sizeBytes,
    mimeType: upload.mimeType,
    width: upload.width,
    height: upload.height,
  });
}

function assertConcurrentRejection(reason: unknown): void {
  const error = reason as { code?: string } | undefined;
  assert.equal(error?.code, 'local_result_in_progress', 'Concurrent duplicate may only lose the ticket advisory-lock race');
}

test('C5B production composition survives restart across both ON_DEVICE boundaries and reaches SUCCESS only after INTERNAL verify', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8, application_name: 'bers-c5b-composite-vertical' });
  await migrateTransactionSchema(pool);
  await migrateFinalImageLineageSchema(pool);
  await migrateProjectSchema(pool);
  await pool.query(`TRUNCATE workflow_continuations,canonical_projects,canonical_project_history,canonical_project_versions,
    canonical_image_artifacts,canonical_mask_artifacts,local_execution_uploads,local_execution_tickets,
    transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE`).catch(() => undefined);
  t.after(async () => {
    await pool.query(`TRUNCATE workflow_continuations,canonical_projects,canonical_project_history,canonical_project_versions,
      canonical_image_artifacts,canonical_mask_artifacts,local_execution_uploads,local_execution_tickets,
      transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE`).catch(() => undefined);
    await pool.end();
  });

  let providerCalls = 0;
  const forbiddenFetcher: typeof fetch = async () => {
    providerCalls += 1;
    throw new Error('C5B LOCAL_ONLY composite must not cross an external HTTP/provider boundary');
  };

  // Production stays blocked because MobileSAM is CANDIDATE. The test-only catalog
  // aliases the exact standalone/composite MobileSAM authority so hosted acceptance can
  // exercise the already-proven graph without creating an independent composite trust root.
  await assert.rejects(
    () => createProductionCore({ ...config, nodeEnv: 'production' }, { testLocalModelsByCapability: testModels }),
    /Test local authority injection is forbidden outside nodeEnv=test/,
  );

  const originalPixels = new Uint8ClampedArray([
    11,21,31,255, 12,22,32,200, 13,23,33,128, 14,24,34,0,
    41,51,61,255, 42,52,62,220, 43,53,63,100, 44,54,64,1,
    71,81,91,255, 72,82,92,180, 73,83,93,64, 74,84,94,10,
    101,111,121,255, 102,112,122,160, 103,113,123,32, 104,114,124,0,
  ]);
  const maskAlpha = new Uint8Array([255,128,0,255, 64,255,128,0, 255,200,32,255, 1,254,127,255]);
  const sourcePng = await rgbaPng(4, 4, originalPixels);

  let production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 10_000, testLocalModelsByCapability: testModels });
  t.after(async () => { await production.close().catch(() => undefined); });
  assert.equal(production.localExecution.compositeStartAdmission.check().admitted, true, 'test Core must select the same exact alias topology used by D0 admission');

  const project = await production.projects.create(auth, 'C5B Composite Project', sourcePng, { maxDimension: 256, maxPixels: 65_536 });
  const scope = Object.freeze({ tenantId, userId, projectId: String(project.project_id) });
  const originalStorageId = String(project.original_image_storage_id);
  const originalId = production.artifacts.external.issueStoredOriginal(originalStorageId, scope);

  const started = await production.localExecution.composite.start({
    clientRequestId: 'c5b-composite-request',
    inputArtifactId: originalId,
    analysis,
    points,
  }, scope);
  assert.equal(started.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(started.nextAction?.type, 'LOCAL_EXECUTION');
  const issuedSegmentTicket = started.nextAction?.ticket as LocalExecutionTicket;
  assert.equal(issuedSegmentTicket.version, '1');
  assert.equal(issuedSegmentTicket.operation.capability, LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment);
  assert.equal(issuedSegmentTicket.policy, 'LOCAL_ONLY');
  assert.deepEqual(issuedSegmentTicket.allowedModels, [testMobileSam]);
  assert.deepEqual(issuedSegmentTicket.cost, { paidCloudCredits: 0, providerCalls: 0 });

  // Hard restart immediately after the first ON_DEVICE dispatch. The new Core must recover
  // exactly the same outstanding MobileSAM ticket before any result is submitted.
  await production.close();
  production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 10_500, testLocalModelsByCapability: testModels });
  const resumedSegment = await production.localExecution.composite.resume(started.executionId, scope);
  assert.equal(resumedSegment.state, 'WAITING_FOR_LOCAL_RESULT');
  const segmentTicket = resumedSegment.nextAction?.ticket as LocalExecutionTicket;
  assert.equal(segmentTicket.ticketId, issuedSegmentTicket.ticketId);
  assert.equal(segmentTicket.nonce, issuedSegmentTicket.nonce);
  assert.equal(segmentTicket.operation.capability, issuedSegmentTicket.operation.capability);
  assert.deepEqual(segmentTicket.inputs, issuedSegmentTicket.inputs);
  assert.deepEqual(segmentTicket.allowedModels, issuedSegmentTicket.allowedModels);

  const maskUpload = await production.localExecution.uploads.persist({
    ticketId: segmentTicket.ticketId,
    scope,
    kind: 'mask',
    role: 'MASK',
    mimeType: 'application/octet-stream',
    width: 4,
    height: 4,
    bytes: maskAlpha,
    expiresAt: segmentTicket.expiresAt,
    now: 10_501,
  });
  const segmentResult = v1Result(segmentTicket, evidenceFrom(maskUpload));

  // Two independent Core instances race the exact same admitted result. The PostgreSQL ticket
  // lock may make one caller return IN_PROGRESS, or a sufficiently late caller may observe an
  // exact terminal replay; neither path may publish/bind a second MASK or select a different next ticket.
  const concurrentSegmentCore = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 10_500, testLocalModelsByCapability: testModels });
  let afterSegment;
  try {
    const raced = await Promise.allSettled([
      production.localExecution.composite.submitLocalResult(started.executionId, scope, segmentResult),
      concurrentSegmentCore.localExecution.composite.submitLocalResult(started.executionId, scope, segmentResult),
    ]);
    const fulfilled = raced.filter((entry): entry is PromiseFulfilledResult<Awaited<ReturnType<typeof production.localExecution.composite.submitLocalResult>>> => entry.status === 'fulfilled').map(entry => entry.value);
    const rejected = raced.filter((entry): entry is PromiseRejectedResult => entry.status === 'rejected');
    assert.ok(fulfilled.length >= 1, 'At least one independent Core must commit the exact segmentation result');
    rejected.forEach(entry => assertConcurrentRejection(entry.reason));

    const replayed = await concurrentSegmentCore.localExecution.composite.submitLocalResult(started.executionId, scope, segmentResult);
    fulfilled.push(replayed);
    afterSegment = fulfilled[0];
    for (const view of fulfilled) {
      assert.equal(view.state, 'WAITING_FOR_LOCAL_RESULT');
      assert.equal(view.nextAction?.ticket?.ticketId, afterSegment.nextAction?.ticket?.ticketId);
    }
  } finally {
    await concurrentSegmentCore.close();
  }

  const backgroundTicket = afterSegment.nextAction?.ticket as LocalExecutionTicketV2;
  assert.equal(backgroundTicket.version, '2');
  assert.equal(backgroundTicket.operation.capability, LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation);
  assert.equal(backgroundTicket.policy, 'LOCAL_ONLY');
  assert.deepEqual(backgroundTicket.allowedExecutors, [{ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' }]);
  assert.deepEqual(backgroundTicket.cost, { paidCloudCredits: 0, providerCalls: 0 });

  const segmentRows = await pool.query(`SELECT storage_id,source_image_storage_id,producer_operation FROM canonical_mask_artifacts
    WHERE local_execution_ticket_id=$1`, [segmentTicket.ticketId]);
  assert.equal(segmentRows.rowCount, 1, 'concurrent exact segmentation submit must publish one canonical MASK');
  assert.equal(segmentRows.rows[0].source_image_storage_id, originalStorageId);
  assert.equal(segmentRows.rows[0].producer_operation, 'LOCAL_SEGMENTATION');
  const maskStorageId = String(segmentRows.rows[0].storage_id);

  // Hard restart between the two ON_DEVICE boundaries: no process-local execution state survives.
  await production.close();
  production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 11_000, testLocalModelsByCapability: testModels });
  const resumed = await production.localExecution.composite.resume(started.executionId, scope);
  assert.equal(resumed.state, 'WAITING_FOR_LOCAL_RESULT');
  const resumedTicket = resumed.nextAction?.ticket as LocalExecutionTicketV2;
  assert.equal(resumedTicket.ticketId, backgroundTicket.ticketId);
  assert.equal(resumedTicket.nonce, backgroundTicket.nonce);

  const source = await production.artifacts.images.loadSource(originalStorageId, scope);
  assert.ok(source);
  const decoded = await decodedRgba(source.bytes);
  const expected = isolateBackgroundRgba(decoded.data, maskAlpha, 4, 4);
  const compositePng = await rgbaPng(4, 4, expected);
  const imageUpload = await production.localExecution.uploads.persist({
    ticketId: resumedTicket.ticketId,
    scope,
    kind: 'image',
    role: 'COMPOSITE',
    mimeType: 'image/png',
    width: 4,
    height: 4,
    bytes: compositePng,
    expiresAt: resumedTicket.expiresAt,
    now: 11_001,
  });
  const backgroundResult = v2Result(resumedTicket, evidenceFrom(imageUpload));

  const concurrentBackgroundCore = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 11_000, testLocalModelsByCapability: testModels });
  let completed;
  try {
    const raced = await Promise.allSettled([
      production.localExecution.composite.submitLocalResult(started.executionId, scope, backgroundResult),
      concurrentBackgroundCore.localExecution.composite.submitLocalResult(started.executionId, scope, backgroundResult),
    ]);
    const fulfilled = raced.filter((entry): entry is PromiseFulfilledResult<Awaited<ReturnType<typeof production.localExecution.composite.submitLocalResult>>> => entry.status === 'fulfilled').map(entry => entry.value);
    const rejected = raced.filter((entry): entry is PromiseRejectedResult => entry.status === 'rejected');
    assert.ok(fulfilled.length >= 1, 'At least one independent Core must commit the exact Background Isolation result');
    rejected.forEach(entry => assertConcurrentRejection(entry.reason));

    const replayed = await concurrentBackgroundCore.localExecution.composite.submitLocalResult(started.executionId, scope, backgroundResult);
    fulfilled.push(replayed);
    completed = fulfilled[0];
    for (const view of fulfilled) {
      assert.equal(view.state, 'SUCCESS');
      assert.equal(view.terminalArtifactId, completed.terminalArtifactId);
    }
  } finally {
    await concurrentBackgroundCore.close();
  }

  assert.equal(completed.state, 'SUCCESS', 'workflow may become SUCCESS only after server-owned INTERNAL verify completes');
  assert.ok(completed.terminalArtifactId);

  const finalClaim = production.artifacts.external.resolveStoredFinalId(completed.terminalArtifactId!, scope);
  const finalRows = await pool.query(`SELECT storage_id,source_image_storage_id,mask_storage_id,producer_operation,image_bytes
    FROM canonical_image_artifacts WHERE storage_id=$1`, [finalClaim.storageId]);
  assert.equal(finalRows.rowCount, 1);
  assert.equal(finalRows.rows[0].source_image_storage_id, originalStorageId);
  assert.equal(finalRows.rows[0].mask_storage_id, maskStorageId);
  assert.equal(finalRows.rows[0].producer_operation, 'BACKGROUND_ISOLATION');
  const finalPixels = await decodedRgba(new Uint8Array(finalRows.rows[0].image_bytes));
  assert.deepEqual([...finalPixels.data], [...expected], 'canonical FINAL must contain Core-recomputed deterministic pixels');
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE execution_id=$1 AND role='COMPOSITE' AND lifecycle='FINAL'", [started.executionId])).rows[0].count), 1, 'concurrent exact Background Isolation submit must publish one canonical FINAL');

  const continuation = await pool.query('SELECT state,current_step_id,terminal_artifact_id,completed_steps_json FROM workflow_continuations WHERE execution_id=$1', [started.executionId]);
  assert.equal(continuation.rowCount, 1);
  assert.equal(continuation.rows[0].state, 'SUCCESS');
  assert.equal(continuation.rows[0].terminal_artifact_id, completed.terminalArtifactId);
  assert.deepEqual(continuation.rows[0].completed_steps_json.map((step: { stepId: string }) => step.stepId), [
    'local-continuation-01-segment',
    'local-continuation-02-background-isolation',
    'local-continuation-03-verify',
  ]);

  const runRows = await pool.query(`SELECT run_id,capability,authority_kind,authority_ref,parent_run_id,status,idempotency_key
    FROM canonical_execution_runs WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3`, [scope.tenantId, scope.userId, scope.projectId]);
  assert.equal(runRows.rowCount, 4, 'accepted C5B graph must project exactly one parent plus three durable step children');
  const parentRun = runRows.rows.find(row => row.capability === 'WORKFLOW_CONTINUATION');
  assert.ok(parentRun);
  assert.equal(parentRun.authority_kind, 'WORKFLOW_CONTINUATION');
  assert.equal(parentRun.authority_ref, started.executionId);
  assert.equal(parentRun.parent_run_id, null);
  assert.equal(parentRun.status, 'SUCCEEDED');

  const childRuns = runRows.rows.filter(row => row.parent_run_id === parentRun.run_id);
  assert.equal(childRuns.length, 3);
  const segmentRun = childRuns.find(row => row.capability === 'LOCAL_EXECUTION' && row.authority_ref === segmentTicket.ticketId);
  const backgroundRun = childRuns.find(row => row.capability === 'LOCAL_EXECUTION' && row.authority_ref === resumedTicket.ticketId);
  const verifyRun = childRuns.find(row => row.capability === 'WORKFLOW_STEP');
  assert.ok(segmentRun);
  assert.ok(backgroundRun);
  assert.ok(verifyRun);
  assert.equal(segmentRun.authority_kind, 'LOCAL_EXECUTION_TICKET');
  assert.equal(segmentRun.status, 'SUCCEEDED');
  assert.equal(backgroundRun.authority_kind, 'LOCAL_EXECUTION_TICKET');
  assert.equal(backgroundRun.status, 'SUCCEEDED');
  assert.equal(verifyRun.authority_kind, 'WORKFLOW_INTERNAL_STEP');
  assert.equal(verifyRun.authority_ref, `workflow-internal-step:${started.executionId}:local-continuation-03-verify`);
  assert.equal(verifyRun.idempotency_key, `workflow-child:${parentRun.run_id}:local-continuation-03-verify`);
  assert.equal(verifyRun.status, 'SUCCEEDED');

  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);

  // A second full Core instance must recover the terminal state without recomputation or publication.
  await production.close();
  production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 12_000, testLocalModelsByCapability: testModels });
  const terminalReplay = await production.localExecution.composite.resume(started.executionId, scope);
  assert.equal(terminalReplay.state, 'SUCCESS');
  assert.equal(terminalReplay.terminalArtifactId, completed.terminalArtifactId);
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE execution_id=$1 AND role='COMPOSITE' AND lifecycle='FINAL'", [started.executionId])).rows[0].count), 1);
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);
});