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
import { cropRgba8 } from '../src/platform/creative/deterministic/Crop.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for deterministic Crop PostgreSQL acceptance');

const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'must-not-be-called',
  falBaseUrl: 'https://provider.crop.invalid', jwtSecret: 'crop-jwt-secret', jwtIssuer: 'crop-test', jwtAudience: 'crop-core',
  artifactSigningSecret: 'crop-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 128_000, maskUploadLimitBytes: 128_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 2_000_000, imageMaxDimension: 256, imageMaxPixels: 65_536,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});

const tenantId = 'crop-tenant';
const userId = 'crop-user';
const auth = Object.freeze({ tenantId, userId });
const rect = Object.freeze({ x: 1, y: 1, width: 2, height: 2 });

function buildResult(ticket: LocalExecutionTicketV2, evidence: LocalExecutionOutputEvidence): LocalExecutionResultV2 {
  return Object.freeze({
    ticketId: ticket.ticketId, ticketVersion: '2', requestId: ticket.requestId, workflowId: ticket.workflowId, stepId: ticket.stepId, nonce: ticket.nonce,
    executor: Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'crop', version: '1' }), runtime: 'BROWSER_JS', accelerator: 'cpu',
    outputs: Object.freeze([evidence]), metrics: Object.freeze({ latencyMs: 2 }), benchmarkEvidence: Object.freeze({ pixelCount: rect.width * rect.height, deterministicTool: 'crop@1' }),
  });
}

async function rgbaPng(width: number, height: number, data: Uint8ClampedArray): Promise<Uint8Array> {
  return new Uint8Array(await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
}
async function decodedRgba(bytes: Uint8Array) {
  const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return Object.freeze({ width: decoded.info.width, height: decoded.info.height, data: new Uint8ClampedArray(decoded.data) });
}

test('deterministic Crop PostgreSQL vertical rejects tamper/scope/replay conflicts and publishes one source-lineaged zero-cloud FINAL', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-deterministic-crop-vertical' });
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
  const forbiddenFetcher: typeof fetch = async () => { providerCalls += 1; throw new Error('deterministic Crop must not cross an external provider boundary'); };
  const sourceWidth = 4, sourceHeight = 3;
  const originalPixels = new Uint8ClampedArray([
    1,2,3,0, 11,12,13,1, 21,22,23,2, 31,32,33,3,
    41,42,43,4, 51,52,53,5, 61,62,63,6, 71,72,73,7,
    81,82,83,8, 91,92,93,9, 101,102,103,10, 111,112,113,11,
  ]);
  const originalPng = await rgbaPng(sourceWidth, sourceHeight, originalPixels);

  let production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 20_000 });
  t.after(async () => { await production.close().catch(() => undefined); });
  const projectRow = await production.projects.create(auth, 'Crop Project', originalPng, { maxDimension: 256, maxPixels: 65_536 });
  const scope = Object.freeze({ tenantId, userId, projectId: String(projectRow.project_id) });
  const originalStorageId = String(projectRow.original_image_storage_id);
  const originalId = production.artifacts.external.issueStoredOriginal(originalStorageId, scope);
  const storedSource = await production.artifacts.images.loadSource(originalStorageId, scope);
  assert.ok(storedSource);
  const canonicalSource = await decodedRgba(storedSource.bytes);

  const prepare = async (clientRequestId: string, patch: Partial<typeof rect> = {}) => production.localExecution.crop.prepare({ projectId: scope.projectId, sourceArtifactId: originalId, clientRequestId, ...rect, ...patch }, auth);
  const prepared = await prepare('crop-success-replay');
  const ticket = prepared.ticket;
  assert.equal(ticket.operation.capability, 'local:tool:crop:v1');
  assert.deepEqual(ticket.operation.parameters, { sourceArtifactId: originalId, ...rect, deterministicTool: 'crop@1', coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_INDICES', rectangleSemantics: 'HALF_OPEN' });
  assert.deepEqual(ticket.expectedOutputs, [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: 2, height: 2 }]);
  assert.deepEqual(ticket.allowedExecutors, [{ kind: 'DETERMINISTIC_TOOL', toolId: 'crop', version: '1' }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });

  const delivered = await production.localExecution.inputDelivery.crop({ ticketId: ticket.ticketId, projectId: scope.projectId }, auth);
  assert.equal(delivered.sourceArtifactId, originalId);
  assert.deepEqual([delivered.width, delivered.height], [sourceWidth, sourceHeight]);
  assert.deepEqual([...delivered.sourceRgba], [...canonicalSource.data]);

  await assert.rejects(
    () => prepare('crop-success-replay', { x: 0 }),
    (error: any) => error?.code === 'local_execution_idempotency_mismatch',
    'same clientRequestId cannot be rebound to another rectangle',
  );

  const otherProject = await production.projects.create(auth, 'Other Crop Project', originalPng, { maxDimension: 256, maxPixels: 65_536 });
  const otherScope = Object.freeze({ tenantId, userId, projectId: String(otherProject.project_id) });
  const otherOriginalId = production.artifacts.external.issueStoredOriginal(String(otherProject.original_image_storage_id), otherScope);
  await assert.rejects(
    () => production.localExecution.crop.prepare({ projectId: scope.projectId, sourceArtifactId: otherOriginalId, clientRequestId: 'crop-cross-project', ...rect }, auth),
    (error: any) => error?.code === 'artifact_scope_denied',
    'cross-project source identity must be rejected before local execution',
  );

  const boundsTicket = (await prepare('crop-hostile-bounds', { x: 3, y: 2, width: 2, height: 2 }).catch(error => error)) as any;
  assert.equal(boundsTicket?.code, 'local_input_lineage_unavailable', 'out-of-bounds rectangle must fail against canonical source geometry before ticket publication');

  const expected = cropRgba8(canonicalSource.data, sourceWidth, sourceHeight, rect);
  const wrongTicket = (await prepare('crop-wrong-byte')).ticket;
  const wrong = Uint8ClampedArray.from(expected); wrong[0] ^= 1;
  const wrongEvidence = await production.localExecution.crop.uploadImage({ ticketId: wrongTicket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(rect.width, rect.height, wrong) }, auth);
  await assert.rejects(
    () => production.localExecution.crop.submit({ ticketId: wrongTicket.ticketId, projectId: scope.projectId, result: buildResult(wrongTicket, wrongEvidence) }, auth),
    (error: any) => error?.code === 'local_crop_pixel_mismatch',
    'one candidate byte mismatch must block canonical publication',
  );

  const wrongDimensionsTicket = (await prepare('crop-wrong-dimensions')).ticket;
  await assert.rejects(
    () => production.localExecution.crop.uploadImage({ ticketId: wrongDimensionsTicket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(1, 1, new Uint8ClampedArray([1,2,3,4])) }, auth),
    (error: any) => error?.code === 'local_image_dimensions_mismatch',
  );

  const evidence = await production.localExecution.crop.uploadImage({ ticketId: ticket.ticketId, projectId: scope.projectId, bytes: await rgbaPng(rect.width, rect.height, expected) }, auth);
  const result = buildResult(ticket, evidence);
  const success = await production.localExecution.crop.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(success.status, 'SUCCESS');
  assert.ok(success.artifactId);
  const finalClaim = production.artifacts.external.resolveStoredFinalId(success.artifactId!, scope);
  const finalRows = await pool.query("SELECT * FROM canonical_image_artifacts WHERE project_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId, ticket.requestId]);
  assert.equal(finalRows.rowCount, 1);
  assert.equal(finalRows.rows[0].storage_id, finalClaim.storageId);
  assert.equal(finalRows.rows[0].source_image_storage_id, originalStorageId);
  assert.equal(finalRows.rows[0].mask_storage_id, null);
  assert.equal(finalRows.rows[0].producer_operation, 'CROP');
  const finalPixels = await decodedRgba(new Uint8Array(finalRows.rows[0].image_bytes));
  assert.deepEqual([finalPixels.width, finalPixels.height], [rect.width, rect.height]);
  assert.deepEqual([...finalPixels.data], [...expected]);

  const beforeAccept = await production.projects.get(auth, scope.projectId);
  assert.equal(beforeAccept.current_image_storage_id, originalStorageId, 'Crop publication must not mutate Project current image');
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);

  await production.close();
  production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 21_000 });
  const replay = await production.localExecution.crop.submit({ ticketId: ticket.ticketId, projectId: scope.projectId, result }, auth);
  assert.equal(replay.status, 'SUCCESS');
  assert.equal(replay.artifactId, success.artifactId);
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE project_id=$1 AND execution_id=$2 AND role='COMPOSITE' AND lifecycle='FINAL'", [scope.projectId, ticket.requestId])).rows[0].count), 1);
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);

  await production.projects.acceptFinal(auth, scope.projectId, finalClaim.storageId, 'Accept deterministic Crop');
  const afterAccept = await production.projects.get(auth, scope.projectId);
  assert.equal(afterAccept.current_image_storage_id, finalClaim.storageId);
  assert.equal(Number((await pool.query("SELECT count(*)::int AS count FROM canonical_project_history WHERE project_id=$1 AND kind='ACCEPTED_FINAL' AND retired_at IS NULL", [scope.projectId])).rows[0].count), 1);
});
