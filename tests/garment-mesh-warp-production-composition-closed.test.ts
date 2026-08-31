import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { createProductionCore } from '../server/core/composition/createProductionCore.ts';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateMaskArtifactSchema } from '../server/core/artifacts/maskArtifactSchema.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { BODY_ANCHOR_COORDINATE_SPACE } from '../server/core/fashion/bodyAnchorGeometry.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentWarpLayerStore } from '../server/core/fashion/postgresGarmentWarpLayerStore.ts';
import { PostgresProjectBodyAnchorStore } from '../server/core/fashion/postgresProjectBodyAnchorStore.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import type { LocalExecutionResultV2 } from '../src/platform/creative/canonical/index.ts';
import { garmentMeshWarpRgba8 } from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import { GARMENT_MESH_WARP_CAPABILITY } from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F4b.4 production admission proof');

const config: CoreServerConfig = Object.freeze({
  nodeEnv: 'test', port: 8080, databaseUrl, provider: 'FAL', falKey: 'must-not-be-called',
  falBaseUrl: 'https://provider.f4b4-admitted.invalid', jwtSecret: 'f4b4-admitted-jwt-secret', jwtIssuer: 'f4b4-admitted-test', jwtAudience: 'f4b4-admitted-core',
  authChallengeSecret: '', authDefaultTenantId: '', authPublicOrigin: '', authSessionAbsoluteTtlMs: 8 * 60 * 60 * 1000, authSessionIdleTtlMs: 30 * 60 * 1000,
  resendApiKey: '', authEmailFrom: '', googleOauthClientId: '', googleOauthClientSecret: '',
  artifactSigningSecret: 'f4b4-admitted-artifact-secret', trustedAssetHosts: Object.freeze([]), allowLegacyAssetUrls: false,
  allowedWebOrigins: Object.freeze([]), hardBudgetCredits: 1, creditsPerEdit: 1,
  bodyLimitBytes: 128_000, maskUploadLimitBytes: 128_000, maskMaxDimension: 256,
  imageUploadLimitBytes: 25_165_824, imageMaxDimension: 8192, imageMaxPixels: 67_108_864,
  requestTimeoutMs: 5_000, providerTimeoutMs: 2_000, shutdownTimeoutMs: 2_000,
});
const owner = Object.freeze({ tenantId: 'f4b4-admitted-tenant', userId: 'f4b4-admitted-user' });
const projectLimits = Object.freeze({ maxDimension: 512, maxPixels: 300_000 });
const garmentLimits = Object.freeze({ maxUploadBytes: 2_000_000, maxDimension: 512, maxPixels: 300_000 });

async function image(width: number, height: number, seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 4, background: { r: 30 + seed, g: 60 + seed, b: 90 + seed, alpha: 1 } } }).png().toBuffer());
}
function parametric() {
  return Object.freeze({
    schemaVersion: 1, coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
    points: Object.freeze([[0,0],[1,0],[1,1],[0,1]].map(point => Object.freeze(point))),
    triangles: Object.freeze([Object.freeze([0,1,2]), Object.freeze([0,2,3])]), outline: Object.freeze([0,1,2,3]),
  });
}
function anchors() {
  return Object.freeze({
    schemaVersion: 1, coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE,
    anchors: Object.freeze({ leftShoulder:[0.2,0.12], rightShoulder:[0.8,0.12], leftHip:[0.27,0.76], rightHip:[0.73,0.76] }),
  });
}
function resultFor(ticket: any, upload: any): LocalExecutionResultV2 {
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: '2',
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    executor: GARMENT_MESH_WARP_TOOL_DEFINITION.executor,
    runtime: 'BROWSER_JS',
    accelerator: 'cpu',
    outputs: Object.freeze([Object.freeze(upload)]),
    metrics: Object.freeze({ latencyMs: 9, memoryBytes: 8192 }),
  });
}

const fullReset = 'TRUNCATE canonical_fashion_garment_warp_layers,canonical_project_body_anchor_sets,canonical_garment_representations,canonical_garment_views,canonical_garments,local_execution_uploads,local_execution_tickets,canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE';

test('production Core intersects global image ceilings with F4b.4 hard caps, admits exact LOCAL_ONLY warp, persists only Fashion intermediate and replays after restart without cloud or Billing', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8, application_name: 'bers-f4b4-production-admitted' });
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  t.after(async () => {
    await pool.query(fullReset).catch(() => undefined);
    await pool.end();
  });

  let providerCalls = 0;
  const forbiddenFetcher: typeof fetch = async () => { providerCalls += 1; throw new Error('admitted F4b.4 must never call an external provider'); };
  const production = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 50_000 });
  t.after(async () => { await production.close().catch(() => undefined); });
  await pool.query(fullReset);

  const project = await production.projects.create(owner, 'F4b.4 admitted person', await image(96, 128, 1), projectLimits);
  const projectId = String(project.project_id).toLowerCase();
  const scope = Object.freeze({ ...owner, projectId });
  const sourceStorageId = String(project.current_image_storage_id).toLowerCase();
  const sourceArtifactId = production.artifacts.external.issueStoredOriginal(sourceStorageId, scope);

  const garments = new PostgresGarmentStore(pool);
  const wardrobe = new PostgresGarmentWardrobeStore(pool);
  const representations = new PostgresGarmentRepresentationStore(pool);
  let garment = await garments.createWithInitialView(owner, { name: 'F4b.4 admitted shirt', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await image(64, 80, 2) }, garmentLimits);
  await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'tshirts' });
  garment = (await garments.get(owner, garment.id))!;
  const admitted = await representations.admit(owner, garment.id, garment.revision, {
    tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: [garment.primaryViewId], payload: parametric(),
  });
  const anchorsStore = new PostgresProjectBodyAnchorStore(pool);
  const anchor = await anchorsStore.create(owner, projectId, { payload: anchors(), producerId: 'local.pose-anchor', producerVersion: '1.0.0' });

  const command = Object.freeze({
    projectId,
    sourceArtifactId,
    garmentId: garment.id,
    representationId: admitted.representation.id,
    anchorSetId: anchor.id,
    clientRequestId: 'f4b4-production-admitted-1',
  });
  const prepared = await production.localExecution.garmentMeshWarp.prepare(command, owner);
  assert.equal(prepared.ticket.operation.capability, GARMENT_MESH_WARP_CAPABILITY);
  assert.equal(prepared.ticket.policy, 'LOCAL_ONLY');
  assert.deepEqual(prepared.ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.deepEqual(prepared.ticket.allowedExecutors, [GARMENT_MESH_WARP_TOOL_DEFINITION.executor]);
  assert.equal(prepared.ticket.inputs.length, 1);
  assert.equal(prepared.ticket.inputs[0].artifactId, sourceArtifactId);
  assert.equal(prepared.ticket.managedInputs?.length, 2);
  assert.equal(prepared.ticket.expectedOutputs[0].role, 'WORKING');

  const delivered = await production.localExecution.garmentMeshWarpInputDelivery.deliver(prepared.ticket.ticketId, projectId, owner);
  const expected = garmentMeshWarpRgba8(delivered.basisViewRgba, delivered.basisViewWidth, delivered.basisViewHeight, {
    sourcePointsQ16: delivered.sourcePointsQ16,
    destinationPointsQ16: delivered.destinationPointsQ16,
    triangles: delivered.triangles,
    outputWidth: delivered.outputWidth,
    outputHeight: delivered.outputHeight,
  });
  const candidatePng = new Uint8Array(await sharp(expected, { raw: { width: delivered.outputWidth, height: delivered.outputHeight, channels: 4 } }).png().toBuffer());
  const upload = await production.localExecution.garmentMeshWarp.uploadImage({ ticketId: prepared.ticket.ticketId, projectId, bytes: candidatePng }, owner);
  const result = resultFor(prepared.ticket, upload);
  const submitted = await production.localExecution.garmentMeshWarp.submit({ ticketId: prepared.ticket.ticketId, projectId, result }, owner);
  assert.equal(submitted.status, 'SUCCESS');
  assert.ok(submitted.layerId);

  const layers = new PostgresGarmentWarpLayerStore(pool);
  const stored = await layers.loadByExecution(owner, projectId, prepared.executionId);
  assert.ok(stored);
  assert.equal(stored!.id, submitted.layerId);
  assert.deepEqual([...stored!.rgba], [...expected]);
  assert.equal(stored!.projectImageStorageId, sourceStorageId);
  assert.equal(stored!.garmentId, garment.id);
  assert.equal(stored!.representationId, admitted.representation.id);
  assert.equal(stored!.anchorSetId, anchor.id);

  const masquerade = await pool.query('SELECT count(*)::int AS count FROM canonical_image_artifacts WHERE execution_id=$1 OR storage_id=$2', [prepared.executionId, stored!.id]);
  assert.equal(Number(masquerade.rows[0].count), 0, 'F4b.4 layer must never masquerade as a Project image artifact');
  const current = await pool.query('SELECT current_image_storage_id FROM canonical_projects WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3', [projectId, owner.tenantId, owner.userId]);
  assert.equal(String(current.rows[0].current_image_storage_id).toLowerCase(), sourceStorageId, 'F4b.4 must not mutate Project current image');
  await assert.rejects(production.projects.acceptFinal(owner, projectId, stored!.id), (error: any) => error?.code === 'invalid_final_artifact');
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);

  const latest = (await garments.get(owner, garment.id))!;
  await representations.revoke(owner, garment.id, admitted.representation.id, latest.revision);
  await production.close();

  const restarted = await createProductionCore(config, { fetcher: forbiddenFetcher, now: () => 50_000 });
  t.after(async () => { await restarted.close().catch(() => undefined); });
  const replay = await restarted.localExecution.garmentMeshWarp.submit({ ticketId: prepared.ticket.ticketId, projectId, result }, owner);
  assert.equal(replay.status, 'SUCCESS');
  assert.equal(replay.layerId, stored!.id);
  await assert.rejects(
    () => restarted.localExecution.garmentMeshWarp.prepare({ ...command, clientRequestId: 'f4b4-production-after-revoke' }, owner),
    /representation|unavailable|admitted/i,
  );
  assert.equal(providerCalls, 0);
  assert.equal(Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count), 0);
  const currentAfterReplay = await pool.query('SELECT current_image_storage_id FROM canonical_projects WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3', [projectId, owner.tenantId, owner.userId]);
  assert.equal(String(currentAfterReplay.rows[0].current_image_storage_id).toLowerCase(), sourceStorageId);
});
