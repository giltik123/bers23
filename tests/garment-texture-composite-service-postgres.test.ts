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
  type LocalExecutionTicketV2,
} from '../src/platform/creative/canonical/index.ts';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { garmentMeshWarpRgba8 } from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  GARMENT_TEXTURE_COMPOSITE_OPERATION,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_STEP_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import { garmentTextureCompositeRgba8 } from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';
import { ArtifactAuthority } from '../server/core/artifacts/artifactAuthority.ts';
import { migrateFinalImageLineageSchema } from '../server/core/artifacts/finalImageLineageSchema.ts';
import { migrateLocalExecutionUploadSchema } from '../server/core/artifacts/localExecutionUploadSchema.ts';
import { PostgresImageArtifactStore } from '../server/core/artifacts/postgresImageArtifactStore.ts';
import { PostgresMaskArtifactStore } from '../server/core/artifacts/postgresMaskArtifactStore.ts';
import { SignedArtifactAuthority } from '../server/core/artifacts/signedArtifactAuthority.ts';
import { BODY_ANCHOR_COORDINATE_SPACE } from '../server/core/fashion/bodyAnchorGeometry.ts';
import { GarmentTextureCompositeEvidenceAuthority } from '../server/core/fashion/GarmentTextureCompositeEvidenceAuthority.ts';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { normalizeGarmentTextureFinalLineageParameters } from '../server/core/fashion/garmentTextureFinalLineage.ts';
import { migrateGarmentTextureFinalLineageSchema } from '../server/core/fashion/garmentTextureFinalLineageSchema.ts';
import { migrateGarmentWarpLayerSchema } from '../server/core/fashion/garmentWarpLayerSchema.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentWarpLayerStore } from '../server/core/fashion/postgresGarmentWarpLayerStore.ts';
import { PostgresProjectBodyAnchorStore } from '../server/core/fashion/postgresProjectBodyAnchorStore.ts';
import { migrateProjectBodyAnchorSchema } from '../server/core/fashion/bodyAnchorSchema.ts';
import { GarmentMeshWarpInputDeliveryService } from '../server/core/localExecution/GarmentMeshWarpInputDeliveryService.ts';
import {
  garmentTextureCompositeExecutionId,
  garmentTextureCompositeTicketIdempotencyKey,
} from '../server/core/localExecution/GarmentTextureCompositeExecutionContract.ts';
import { GarmentTextureCompositeInputDeliveryService } from '../server/core/localExecution/GarmentTextureCompositeInputDeliveryService.ts';
import { GarmentTextureCompositeSubmissionAuthority } from '../server/core/localExecution/GarmentTextureCompositeSubmissionAuthority.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { LocalGarmentMeshWarpExecutionService } from '../server/core/localExecution/LocalGarmentMeshWarpExecutionService.ts';
import { ManagedGarmentLocalExecutionInputAuthority } from '../server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';
import { PostgresLocalExecutionLedger } from '../server/core/localExecution/PostgresLocalExecutionLedger.ts';
import { PostgresLocalExecutionUploadStore } from '../server/core/localExecution/PostgresLocalExecutionUploadStore.ts';
import { migrateLocalExecutionLedgerSchema } from '../server/core/localExecution/localExecutionLedgerSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F4b.5b PostgreSQL submission proof');
const owner = Object.freeze({ tenantId: 'f4b5b-service-tenant', userId: 'f4b5b-service-user' });
const projectLimits = Object.freeze({ maxDimension: 512, maxPixels: 300_000 });
const garmentLimits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 512, maxPixels: 300_000 });
let now = 20_000;

async function image(width: number, height: number, seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 4, background: { r: 35 + seed, g: 75 + seed, b: 115 + seed, alpha: 1 } } }).png().toBuffer());
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
function canonicalWarpPlatform(tickets: LocalExecutionTicketAuthority): CreativeExecutionPlatformRuntimeDependencies {
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
function warpResult(ticket: LocalExecutionTicketV2, upload: any): LocalExecutionResultV2 {
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
function textureResult(ticket: LocalExecutionTicketV2, upload: any): LocalExecutionResultV2 {
  return Object.freeze({
    ticketId: ticket.ticketId,
    ticketVersion: '2',
    requestId: ticket.requestId,
    workflowId: ticket.workflowId,
    stepId: ticket.stepId,
    nonce: ticket.nonce,
    executor: Object.freeze({ kind: 'DETERMINISTIC_TOOL' as const, toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION }),
    runtime: 'BROWSER_JS',
    accelerator: 'cpu',
    outputs: Object.freeze([Object.freeze(upload)]),
    metrics: Object.freeze({ latencyMs: 11, memoryBytes: 16384 }),
    benchmarkEvidence: Object.freeze({ phase: 'postgres-f4b5b-submission-proof' }),
  });
}

function makeTextureTicket(input: Readonly<{
  scope: typeof owner & { projectId: string };
  sourceArtifactId: string;
  projectStorageId: string;
  projectSha256: string;
  layer: Awaited<ReturnType<PostgresGarmentWarpLayerStore['load']>> & {};
  view: Awaited<ReturnType<ManagedGarmentLocalExecutionInputAuthority['resolveView']>>;
  representation: Awaited<ReturnType<ManagedGarmentLocalExecutionInputAuthority['resolveParametricRepresentation']>>;
  destinationMeshSha256: string;
  producerParameters: ReturnType<typeof normalizeGarmentTextureFinalLineageParameters>;
  clientRequestId: string;
}>): LocalExecutionTicketV2 {
  const executionId = garmentTextureCompositeExecutionId(input.scope, input.clientRequestId);
  const ticketId = `ticket:${executionId}`;
  return Object.freeze({
    ticketId,
    version: '2',
    issuer: 'CORE',
    requestId: executionId,
    workflowId: executionId,
    stepId: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    operation: Object.freeze({
      id: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
      version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
      type: GARMENT_TEXTURE_COMPOSITE_OPERATION,
      capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
      parameters: Object.freeze({
        sourceArtifactId: input.sourceArtifactId,
        projectImageStorageId: input.projectStorageId,
        projectImageSha256: input.projectSha256,
        garmentWarpLayerId: input.layer.id,
        garmentWarpLayerSha256: input.layer.contentSha256,
        garmentId: input.layer.garmentId,
        viewId: input.layer.viewId,
        viewSha256: input.layer.viewContentSha256,
        representationId: input.layer.representationId,
        representationSha256: input.layer.representationContentSha256,
        anchorSetId: input.layer.anchorSetId,
        anchorPayloadSha256: input.layer.anchorPayloadSha256,
        destinationMeshSha256: input.destinationMeshSha256,
        producerParameters: input.producerParameters.document,
        producerParametersSha256: input.producerParameters.sha256,
        deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`,
        maxDimension: GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
        maxOutputPixels: GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
      }),
    }),
    scope: input.scope,
    inputs: Object.freeze([Object.freeze({ artifactId: input.sourceArtifactId, kind: 'image', role: 'ORIGINAL', sha256: input.projectSha256 })]),
    managedInputs: Object.freeze([input.view.binding, input.representation.binding]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: input.layer.width, height: input.layer.height })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL' as const, toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID, version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION })]),
    policy: 'LOCAL_ONLY',
    idempotencyKey: garmentTextureCompositeTicketIdempotencyKey(input.clientRequestId),
    nonce: randomUUID(),
    issuedAt: now,
    expiresAt: now + 60_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

test('F4b.5b PostgreSQL vertical serializes claims, keeps rejected COMPOSITE immutable, succeeds on a fresh ticket, persists exact Fashion FINAL lineage and replays after restart', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 10, application_name: 'bers-f4b5b-texture-service' });
  try {
    await migrateFinalImageLineageSchema(pool);
    await migrateProjectSchema(pool);
    await migrateGarmentSchema(pool);
    await migrateProjectBodyAnchorSchema(pool);
    await migrateGarmentWarpLayerSchema(pool);
    await migrateGarmentTextureFinalLineageSchema(pool);
    await migrateLocalExecutionUploadSchema(pool);
    await migrateLocalExecutionLedgerSchema(pool);

    const projects = new PostgresProjectStore(pool);
    const project = await projects.create(owner, 'F4b.5b texture person', await image(72, 96, 1), projectLimits);
    const projectId = String(project.project_id).toLowerCase();
    const scope = Object.freeze({ ...owner, projectId });
    const sourceStorageId = String(project.current_image_storage_id).toLowerCase();

    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    let garment = await garments.createWithInitialView(owner, { name: 'F4b.5b texture shirt', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await image(48, 60, 2) }, garmentLimits);
    await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'tshirts' });
    garment = (await garments.get(owner, garment.id))!;
    const admitted = await representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: [garment.primaryViewId], payload: parametric(),
    });

    const managed = new ManagedGarmentLocalExecutionInputAuthority({ garments, representations });
    const bodyAnchors = new PostgresProjectBodyAnchorStore(pool, { wardrobe, representations, managedInputs: managed });
    const anchor = await bodyAnchors.create(owner, projectId, { payload: anchors(), producerId: 'local.pose-anchor', producerVersion: '1.0.0' });

    const signed = new SignedArtifactAuthority('f4b5b-postgres-service-secret', ['example.invalid'], () => now);
    const sourceArtifactId = signed.issueStoredOriginal(sourceStorageId, scope);
    const images = new PostgresImageArtifactStore(pool);
    const artifacts = new ArtifactAuthority(signed, new PostgresMaskArtifactStore(pool), images);
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
    const warpDelivery = new GarmentMeshWarpInputDeliveryService({ admission, managedInputs: managed, bodyAnchors, artifacts, now: () => now });
    const warpService = new LocalGarmentMeshWarpExecutionService({
      platform: canonicalWarpPlatform(ticketAuthority), artifacts, managedInputs: managed, bodyAnchors, delivery: warpDelivery,
      admission, uploads, layers, limits: { maxDimension: 512, maxPixels: 300_000, maxUploadBytes: 2 * 1024 * 1024 }, now: () => now,
    });

    const preparedWarp = await warpService.prepare({
      projectId,
      sourceArtifactId,
      garmentId: garment.id,
      representationId: admitted.representation.id,
      anchorSetId: anchor.id,
      clientRequestId: 'postgres-texture-warp-source',
    }, owner);
    const warpInput = await warpDelivery.deliver(preparedWarp.ticket.ticketId, projectId, owner);
    const warpPixels = garmentMeshWarpRgba8(warpInput.basisViewRgba, warpInput.basisViewWidth, warpInput.basisViewHeight, {
      sourcePointsQ16: warpInput.sourcePointsQ16,
      destinationPointsQ16: warpInput.destinationPointsQ16,
      triangles: warpInput.triangles,
      outputWidth: warpInput.outputWidth,
      outputHeight: warpInput.outputHeight,
    });
    const warpPng = new Uint8Array(await sharp(warpPixels, { raw: { width: warpInput.outputWidth, height: warpInput.outputHeight, channels: 4 } }).png().toBuffer());
    const warpUpload = await warpService.uploadImage({ ticketId: preparedWarp.ticket.ticketId, projectId, bytes: warpPng }, owner);
    const admittedWarp = await warpService.submit({ ticketId: preparedWarp.ticket.ticketId, projectId, result: warpResult(preparedWarp.ticket, warpUpload) }, owner);
    assert.equal(admittedWarp.status, 'SUCCESS');
    const layer = await layers.load(owner, projectId, admittedWarp.layerId);
    assert.ok(layer);

    const evidenceAuthority = new GarmentTextureCompositeEvidenceAuthority({ artifacts, managedInputs: managed, bodyAnchors, layers });
    const resolved = await evidenceAuthority.resolve(scope, { sourceArtifactId, layerId: layer!.id, layerSha256: layer!.contentSha256 });
    const producerParameters = normalizeGarmentTextureFinalLineageParameters({
      schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
      textureTransform: Object.freeze({ scaleXQ16: 65536, scaleYQ16: 65536, offsetXQ16: 0, offsetYQ16: 0, wrapMode: 'CLAMP', alphaPolicy: 'PRESERVE_BASE_ALPHA' }),
      featherRadius: 2,
      colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
    });
    const ticketInput = Object.freeze({
      scope,
      sourceArtifactId,
      projectStorageId: resolved.project.storageId,
      projectSha256: resolved.project.sha256,
      layer: layer!,
      view: resolved.view,
      representation: resolved.representation,
      destinationMeshSha256: resolved.mesh.meshSha256,
      producerParameters,
    });
    const rejectedTicket = makeTextureTicket({ ...ticketInput, clientRequestId: 'postgres-texture-service-rejected' });
    await admission.issueV2(rejectedTicket);

    const textureDelivery = new GarmentTextureCompositeInputDeliveryService({ admission, evidence: evidenceAuthority, now: () => now });
    const makeSubmission = () => new GarmentTextureCompositeSubmissionAuthority({
      admission,
      uploads,
      delivery: textureDelivery,
      maxUploadBytes: 2 * 1024 * 1024,
      completeCanonicalExecution: async ({ artifact }) => {
        assert.equal(artifact.role, 'COMPOSITE');
        assert.equal(artifact.metadata?.garmentWarpLayerId, layer!.id);
        assert.equal(artifact.metadata?.producerParametersSha256, producerParameters.sha256);
        return Object.freeze({ valid: true, checks: Object.freeze(['POSTGRES_F4B5B_BYTE_EXACT_CORE_RECOMPUTE']), errors: Object.freeze([]) });
      },
      persistFinal: (persistScope, executionId, operationId, finalImage, lineage) => images.persistFinal(persistScope, executionId, operationId, finalImage, lineage),
      loadPersistedFinal: (executionId, persistedScope) => images.loadFinalByExecution(executionId, persistedScope),
      issueFinalId: (storageId, finalScope) => signed.issueStoredFinal(storageId, finalScope),
      now: () => now,
    });

    const rejectedDelivery = await textureDelivery.deliver(rejectedTicket.ticketId, projectId, owner);
    assert.equal(rejectedDelivery.projectImageStorageId, sourceStorageId);
    assert.equal(rejectedDelivery.garmentWarpLayerId, layer!.id);
    assert.equal(rejectedDelivery.producerParametersSha256, producerParameters.sha256);
    const expectedFinal = garmentTextureCompositeRgba8(
      rejectedDelivery.projectRgba,
      rejectedDelivery.outputWidth,
      rejectedDelivery.outputHeight,
      rejectedDelivery.garmentSourceRgba,
      rejectedDelivery.garmentSourceWidth,
      rejectedDelivery.garmentSourceHeight,
      {
        sourcePointsQ16: rejectedDelivery.sourcePointsQ16,
        destinationPointsQ16: rejectedDelivery.destinationPointsQ16,
        triangles: rejectedDelivery.triangles,
        outputWidth: rejectedDelivery.outputWidth,
        outputHeight: rejectedDelivery.outputHeight,
      },
      {
        textureTransform: rejectedDelivery.producerParameters.textureTransform,
        featherRadius: rejectedDelivery.producerParameters.featherRadius,
        colorSpacePolicy: rejectedDelivery.producerParameters.colorSpacePolicy,
      },
    );

    const badPixels = Uint8Array.from(expectedFinal); badPixels[0] ^= 1;
    const badPng = new Uint8Array(await sharp(badPixels, { raw: { width: rejectedDelivery.outputWidth, height: rejectedDelivery.outputHeight, channels: 4 } }).png().toBuffer());
    const badUpload = await makeSubmission().uploadImage({ ticketId: rejectedTicket.ticketId, projectId, bytes: badPng }, owner);
    await assert.rejects(
      () => makeSubmission().submit({ ticketId: rejectedTicket.ticketId, projectId, result: textureResult(rejectedTicket, badUpload) }, owner),
      /differs from Core recomputation/i,
    );
    assert.equal(await images.loadFinalByExecution(rejectedTicket.requestId, scope), undefined, 'rejected browser candidate must create no canonical FINAL');
    assert.equal(await admission.getFinalization(rejectedTicket.ticketId), undefined, 'rejected candidate must release rather than finalize the ticket');

    const goodPngForRejectedTicket = new Uint8Array(await sharp(expectedFinal, { raw: { width: rejectedDelivery.outputWidth, height: rejectedDelivery.outputHeight, channels: 4 } }).png().toBuffer());
    await assert.rejects(
      () => makeSubmission().uploadImage({ ticketId: rejectedTicket.ticketId, projectId, bytes: goodPngForRejectedTicket }, owner),
      /does not match the existing quarantined output/i,
      'non-WORKING COMPOSITE quarantine must remain immutable within one ticket',
    );

    const acceptedTicket = makeTextureTicket({ ...ticketInput, clientRequestId: 'postgres-texture-service-accepted' });
    await admission.issueV2(acceptedTicket);
    const acceptedDelivery = await textureDelivery.deliver(acceptedTicket.ticketId, projectId, owner);
    assert.equal(acceptedDelivery.garmentWarpLayerId, rejectedDelivery.garmentWarpLayerId);
    assert.equal(acceptedDelivery.producerParametersSha256, rejectedDelivery.producerParametersSha256);
    assert.equal(acceptedDelivery.projectImageSha256, rejectedDelivery.projectImageSha256);
    const acceptedExpectedFinal = garmentTextureCompositeRgba8(
      acceptedDelivery.projectRgba,
      acceptedDelivery.outputWidth,
      acceptedDelivery.outputHeight,
      acceptedDelivery.garmentSourceRgba,
      acceptedDelivery.garmentSourceWidth,
      acceptedDelivery.garmentSourceHeight,
      {
        sourcePointsQ16: acceptedDelivery.sourcePointsQ16,
        destinationPointsQ16: acceptedDelivery.destinationPointsQ16,
        triangles: acceptedDelivery.triangles,
        outputWidth: acceptedDelivery.outputWidth,
        outputHeight: acceptedDelivery.outputHeight,
      },
      {
        textureTransform: acceptedDelivery.producerParameters.textureTransform,
        featherRadius: acceptedDelivery.producerParameters.featherRadius,
        colorSpacePolicy: acceptedDelivery.producerParameters.colorSpacePolicy,
      },
    );
    assert.deepEqual([...acceptedExpectedFinal], [...expectedFinal]);
    const goodPng = new Uint8Array(await sharp(acceptedExpectedFinal, { raw: { width: acceptedDelivery.outputWidth, height: acceptedDelivery.outputHeight, channels: 4 } }).png().toBuffer());
    const goodUpload = await makeSubmission().uploadImage({ ticketId: acceptedTicket.ticketId, projectId, bytes: goodPng }, owner);
    const goodResult = textureResult(acceptedTicket, goodUpload);

    const claims = await Promise.all([
      admission.claimV2({ ticketId: acceptedTicket.ticketId, result: goodResult, callerScope: acceptedTicket.scope, now }),
      admission.claimV2({ ticketId: acceptedTicket.ticketId, result: goodResult, callerScope: acceptedTicket.scope, now }),
    ]);
    assert.deepEqual(claims.map(claim => claim.allowed ? 'ALLOWED' : claim.reasonCode).sort(), ['ALLOWED', 'IN_PROGRESS']);
    await admission.release(acceptedTicket.ticketId);

    const accepted = await makeSubmission().submit({ ticketId: acceptedTicket.ticketId, projectId, result: goodResult }, owner);
    assert.equal(accepted.status, 'SUCCESS');
    assert.ok(accepted.artifactId);
    assert.equal(accepted.verification.valid, true);

    const stored = await images.loadFinalByExecution(acceptedTicket.requestId, scope);
    assert.ok(stored);
    assert.equal(stored!.producerOperation, 'GARMENT_TEXTURE_COMPOSITE');
    assert.equal(stored!.sourceImageStorageId, sourceStorageId);
    assert.equal(stored!.garmentWarpLayerId, layer!.id);
    assert.equal(stored!.garmentWarpLayerSha256, layer!.contentSha256);
    assert.equal(stored!.producerParametersSha256, producerParameters.sha256);
    assert.deepEqual(stored!.producerParameters, producerParameters.document);
    assert.equal(stored!.width, acceptedDelivery.outputWidth);
    assert.equal(stored!.height, acceptedDelivery.outputHeight);

    const relation = await pool.query(`SELECT producer_operation,source_image_storage_id,garment_warp_layer_id,garment_warp_layer_sha256,producer_parameters_sha256
      FROM canonical_image_artifacts WHERE storage_id=$1`, [stored!.storageId]);
    assert.equal(relation.rowCount, 1);
    assert.deepEqual(relation.rows[0], {
      producer_operation: 'GARMENT_TEXTURE_COMPOSITE',
      source_image_storage_id: sourceStorageId,
      garment_warp_layer_id: layer!.id,
      garment_warp_layer_sha256: layer!.contentSha256,
      producer_parameters_sha256: producerParameters.sha256,
    });

    const restarted = makeSubmission();
    const replay = await restarted.submit({ ticketId: acceptedTicket.ticketId, projectId, result: goodResult }, owner);
    assert.equal(replay.status, 'SUCCESS');
    assert.equal(replay.artifactId, accepted.artifactId);
    assert.equal(replay.verification.valid, true);

    const finalization = await admission.getFinalization(acceptedTicket.ticketId);
    assert.equal(finalization?.status, 'SUCCESS');
  } finally {
    await pool.end();
  }
});