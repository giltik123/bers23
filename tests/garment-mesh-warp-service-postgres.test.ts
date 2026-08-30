import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import {
  CanonicalDecisionService,
  CanonicalPlanningService,
  type CreativeExecutionPlatformRuntimeDependencies,
  type LocalExecutionResultV2,
} from '../src/platform/creative/canonical/index.ts';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { garmentMeshWarpRgba8 } from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import { ArtifactAuthority } from '../server/core/artifacts/artifactAuthority.ts';
import { migrateFinalImageLineageSchema } from '../server/core/artifacts/finalImageLineageSchema.ts';
import { migrateLocalExecutionUploadSchema } from '../server/core/artifacts/localExecutionUploadSchema.ts';
import { PostgresImageArtifactStore } from '../server/core/artifacts/postgresImageArtifactStore.ts';
import { PostgresMaskArtifactStore } from '../server/core/artifacts/postgresMaskArtifactStore.ts';
import { SignedArtifactAuthority } from '../server/core/artifacts/signedArtifactAuthority.ts';
import { BODY_ANCHOR_COORDINATE_SPACE } from '../server/core/fashion/bodyAnchorGeometry.ts';
import { migrateProjectBodyAnchorSchema } from '../server/core/fashion/bodyAnchorSchema.ts';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { migrateGarmentWarpLayerSchema } from '../server/core/fashion/garmentWarpLayerSchema.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentWarpLayerStore } from '../server/core/fashion/postgresGarmentWarpLayerStore.ts';
import { PostgresProjectBodyAnchorStore } from '../server/core/fashion/postgresProjectBodyAnchorStore.ts';
import { GarmentMeshWarpInputDeliveryService } from '../server/core/localExecution/GarmentMeshWarpInputDeliveryService.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { LocalGarmentMeshWarpExecutionService } from '../server/core/localExecution/LocalGarmentMeshWarpExecutionService.ts';
import { ManagedGarmentLocalExecutionInputAuthority } from '../server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';
import { PostgresLocalExecutionLedger } from '../server/core/localExecution/PostgresLocalExecutionLedger.ts';
import { PostgresLocalExecutionUploadStore } from '../server/core/localExecution/PostgresLocalExecutionUploadStore.ts';
import { migrateLocalExecutionLedgerSchema } from '../server/core/localExecution/localExecutionLedgerSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F4b.4 PostgreSQL execution proof');
const owner = Object.freeze({ tenantId: 'f4b4-service-tenant', userId: 'f4b4-service-user' });
const projectLimits = Object.freeze({ maxDimension: 512, maxPixels: 300_000 });
const garmentLimits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 512, maxPixels: 300_000 });
let now = 10_000;

async function image(width: number, height: number, seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 4, background: { r: 30 + seed, g: 70 + seed, b: 110 + seed, alpha: 1 } } }).png().toBuffer());
}
function parametric() {
  return Object.freeze({
    schemaVersion: 1,
    coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
    points: Object.freeze([[0,0],[1,0],[1,1],[0,1]].map(point => Object.freeze(point))),
    triangles: Object.freeze([Object.freeze([0,1,2]), Object.freeze([0,2,3])]),
    outline: Object.freeze([0,1,2,3]),
  });
}
function anchors() {
  return Object.freeze({
    schemaVersion: 1,
    coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE,
    anchors: Object.freeze({ leftShoulder:[0.2,0.12], rightShoulder:[0.8,0.12], leftHip:[0.27,0.76], rightHip:[0.73,0.76] }),
  });
}
function canonicalPlatform(tickets: LocalExecutionTicketAuthority): CreativeExecutionPlatformRuntimeDependencies {
  return {
    decision: new CanonicalDecisionService(),
    planning: new CanonicalPlanningService(),
    routeSelector: { select: operation => operation.type === GARMENT_MESH_WARP_OPERATION ? 'ON_DEVICE' : (() => { throw new Error('unexpected operation'); })() },
    targetSelector: { select: operation => operation.type === GARMENT_MESH_WARP_OPERATION ? 'LOCAL' : 'BLOCKED' },
    providerSelector: { select: () => { throw new Error('provider selection must never run for garment mesh warp'); } },
    capabilityAdmission: { admit: ({ operation, route, target }) => operation.type === GARMENT_MESH_WARP_OPERATION && route === 'ON_DEVICE' && target === 'LOCAL'
      ? Object.freeze({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: GARMENT_MESH_WARP_CAPABILITY })
      : Object.freeze({ allowed: false, reasonCode: 'UNSUPPORTED_OPERATION' }) },
    securityGate: { authorize: () => true },
    runtime: { execute: async () => { throw new Error('server/provider runtime must never execute garment mesh-warp candidate'); } },
    providers: { isAvailable: () => false, fallback: () => undefined },
    verifier: { verify: async operation => Object.freeze({ stepId: operation.id, valid: true, checks: Object.freeze(['POSTGRES_BYTE_EXACT_CORE_RECOMPUTE']), errors: Object.freeze([]) }) },
    recovery: { decide: () => 'ABORT' },
    billing: {
      reserve: async () => { throw new Error('external billing reserve must never run'); },
      commit: async () => { throw new Error('external billing commit must never run'); },
      release: async () => { throw new Error('external billing release must never run'); },
    },
    localExecutionV2: tickets,
    now: () => now,
    id: randomUUID,
  };
}

function resultFor(ticket: any, upload: any): LocalExecutionResultV2 {
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: '2',
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    executor: Object.freeze({ kind: 'DETERMINISTIC_TOOL' as const, toolId: GARMENT_MESH_WARP_TOOL_ID, version: GARMENT_MESH_WARP_TOOL_VERSION }),
    runtime: 'BROWSER_JS',
    accelerator: 'cpu',
    outputs: Object.freeze([Object.freeze(upload)]),
    metrics: Object.freeze({ latencyMs: 9, memoryBytes: 8192 }),
  });
}

test('F4b.4 PostgreSQL vertical admits only Core-recomputed Fashion intermediate and restart replay survives later revocation', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8, application_name: 'bers-f4b4-warp-service' });
  try {
    await migrateFinalImageLineageSchema(pool);
    await migrateProjectSchema(pool);
    await migrateGarmentSchema(pool);
    await migrateProjectBodyAnchorSchema(pool);
    await migrateGarmentWarpLayerSchema(pool);
    await migrateLocalExecutionUploadSchema(pool);
    await migrateLocalExecutionLedgerSchema(pool);

    const projects = new PostgresProjectStore(pool);
    const project = await projects.create(owner, 'F4b.4 service person', await image(96, 128, 1), projectLimits);
    const projectId = String(project.project_id).toLowerCase();
    const scope = Object.freeze({ ...owner, projectId });
    const sourceStorageId = String(project.current_image_storage_id).toLowerCase();

    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    let garment = await garments.createWithInitialView(owner, { name: 'F4b.4 service shirt', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await image(64, 80, 2) }, garmentLimits);
    await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'tshirts' });
    garment = (await garments.get(owner, garment.id))!;
    const admitted = await representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: [garment.primaryViewId], payload: parametric(),
    });

    const managed = new ManagedGarmentLocalExecutionInputAuthority({ garments, representations });
    const bodyAnchors = new PostgresProjectBodyAnchorStore(pool, { wardrobe, representations, managedInputs: managed });
    const anchor = await bodyAnchors.create(owner, projectId, { payload: anchors(), producerId: 'local.pose-anchor', producerVersion: '1.0.0' });

    const signed = new SignedArtifactAuthority('f4b4-postgres-service-secret', ['example.invalid'], () => now);
    const sourceArtifactId = signed.issueStoredOriginal(sourceStorageId, scope);
    const artifacts = new ArtifactAuthority(signed, new PostgresMaskArtifactStore(pool), new PostgresImageArtifactStore(pool));
    const admission = new PostgresLocalExecutionLedger(pool);
    const ticketAuthority = new LocalExecutionTicketAuthority(admission, {
      now: () => now,
      id: randomUUID,
      nonce: randomUUID,
      ttlMs: 60_000,
      modelsByCapability: {},
      executorsByCapability: Object.freeze({
        [GARMENT_MESH_WARP_CAPABILITY]: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL' as const, toolId: GARMENT_MESH_WARP_TOOL_ID, version: GARMENT_MESH_WARP_TOOL_VERSION })]),
      }),
    });
    const uploads = new PostgresLocalExecutionUploadStore(pool);
    const layers = new PostgresGarmentWarpLayerStore(pool);
    const delivery = new GarmentMeshWarpInputDeliveryService({ admission, managedInputs: managed, bodyAnchors, artifacts, now: () => now });
    const makeService = () => new LocalGarmentMeshWarpExecutionService({
      platform: canonicalPlatform(ticketAuthority),
      artifacts,
      managedInputs: managed,
      bodyAnchors,
      delivery,
      admission,
      uploads,
      layers,
      limits: { maxDimension: 512, maxPixels: 300_000, maxUploadBytes: 2 * 1024 * 1024 },
      now: () => now,
    });

    const service = makeService();
    const command = Object.freeze({
      projectId,
      sourceArtifactId,
      garmentId: garment.id,
      representationId: admitted.representation.id,
      anchorSetId: anchor.id,
      clientRequestId: 'postgres-warp-service-1',
    });
    const prepared = await service.prepare(command, owner);
    assert.equal(prepared.ticket.policy, 'LOCAL_ONLY');
    assert.equal(prepared.ticket.cost.paidCloudCredits, 0);
    assert.equal(prepared.ticket.cost.providerCalls, 0);
    assert.equal(prepared.ticket.inputs.length, 1);
    assert.equal(prepared.ticket.inputs[0].artifactId, sourceArtifactId);
    assert.equal(prepared.ticket.managedInputs?.length, 2);
    assert.equal(prepared.ticket.expectedOutputs[0].role, 'WORKING');

    const delivered = await delivery.deliver(prepared.ticket.ticketId, projectId, owner);
    const expected = garmentMeshWarpRgba8(delivered.basisViewRgba, delivered.basisViewWidth, delivered.basisViewHeight, {
      sourcePointsQ16: delivered.sourcePointsQ16,
      destinationPointsQ16: delivered.destinationPointsQ16,
      triangles: delivered.triangles,
      outputWidth: delivered.outputWidth,
      outputHeight: delivered.outputHeight,
    });
    const candidatePng = new Uint8Array(await sharp(expected, { raw: { width: delivered.outputWidth, height: delivered.outputHeight, channels: 4 } }).png().toBuffer());
    const upload = await service.uploadImage({ ticketId: prepared.ticket.ticketId, projectId, bytes: candidatePng }, owner);
    const result = resultFor(prepared.ticket, upload);
    const submitted = await service.submit({ ticketId: prepared.ticket.ticketId, projectId, result }, owner);
    assert.equal(submitted.status, 'SUCCESS');
    assert.ok(submitted.layerId);

    const stored = await layers.loadByExecution(owner, projectId, prepared.executionId);
    assert.ok(stored);
    assert.equal(stored!.id, submitted.layerId);
    assert.equal(stored!.projectImageStorageId, sourceStorageId);
    assert.equal(stored!.garmentId, garment.id);
    assert.equal(stored!.representationId, admitted.representation.id);
    assert.equal(stored!.anchorSetId, anchor.id);
    assert.equal(stored!.destinationMeshSha256, delivered.destinationMeshSha256);
    assert.deepEqual([...stored!.rgba], [...expected]);
    const masquerade = await pool.query('SELECT 1 FROM canonical_image_artifacts WHERE storage_id=$1 OR execution_id=$2', [stored!.id, prepared.executionId]);
    assert.equal(masquerade.rowCount, 0, 'admitted warp must remain Fashion intermediate, never Project FINAL');
    await assert.rejects(projects.acceptFinal(owner, projectId, stored!.id), (error: any) => error?.code === 'invalid_final_artifact');

    // A fresh process recovers a consumed ticket only from its immutable admitted layer.
    const restarted = makeService();
    const replay = await restarted.submit({ ticketId: prepared.ticket.ticketId, projectId, result }, owner);
    assert.equal(replay.status, 'SUCCESS');
    assert.equal(replay.layerId, stored!.id);

    // Historical replay remains valid after the mutable source authorities are revoked.
    const latest = (await garments.get(owner, garment.id))!;
    await representations.revoke(owner, garment.id, admitted.representation.id, latest.revision);
    const replayAfterRevocation = await makeService().submit({ ticketId: prepared.ticket.ticketId, projectId, result }, owner);
    assert.equal(replayAfterRevocation.status, 'SUCCESS');
    assert.equal(replayAfterRevocation.layerId, stored!.id);
    await assert.rejects(() => makeService().prepare({ ...command, clientRequestId: 'postgres-warp-service-after-revoke' }, owner), /representation|unavailable|admitted/i);

    const finalization = await admission.getFinalization(prepared.ticket.ticketId);
    assert.equal(finalization?.status, 'SUCCESS');
  } finally {
    await pool.end();
  }
});
