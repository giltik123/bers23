import type { Pool } from 'pg';
import type { CreativeExecutionPlatformRuntimeDependencies } from '../../../src/platform/creative/canonical/index.ts';
import {
  GARMENT_MESH_WARP_MAX_DIMENSION,
  GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS,
} from '../../../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import { checkGarmentSchema, migrateGarmentSchema } from '../fashion/garmentSchema.ts';
import { checkProjectBodyAnchorSchema, migrateProjectBodyAnchorSchema } from '../fashion/bodyAnchorSchema.ts';
import { checkGarmentWarpLayerSchema, migrateGarmentWarpLayerSchema } from '../fashion/garmentWarpLayerSchema.ts';
import { checkGarmentTextureFinalLineageSchema, migrateGarmentTextureFinalLineageSchema } from '../fashion/garmentTextureFinalLineageSchema.ts';
import { FashionTryOnFinalResultService } from '../fashion/FashionTryOnFinalResultService.ts';
import { FashionTryOnProductService } from '../fashion/FashionTryOnProductService.ts';
import { FashionTryOnReadinessService } from '../fashion/FashionTryOnReadinessService.ts';
import { FashionTryOnRecoveryPreviewService } from '../fashion/FashionTryOnRecoveryPreviewService.ts';
import { FashionTryOnTextureContinuationService } from '../fashion/FashionTryOnTextureContinuationService.ts';
import { FashionTryOnWarpOrchestrationService } from '../fashion/FashionTryOnWarpOrchestrationService.ts';
import { ManualParametricGarmentAdmissionService } from '../fashion/ManualParametricGarmentAdmissionService.ts';
import { ManualProjectBodyAnchorAcquisitionService } from '../fashion/ManualProjectBodyAnchorAcquisitionService.ts';
import { PostgresGarmentStore } from '../fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../fashion/postgresGarmentRepresentationStore.ts';
import { PostgresProjectBodyAnchorStore } from '../fashion/postgresProjectBodyAnchorStore.ts';
import { PostgresGarmentWarpLayerStore } from '../fashion/postgresGarmentWarpLayerStore.ts';
import type { LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';
import { ManagedGarmentLocalExecutionInputAuthority } from '../localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';
import { GarmentMeshWarpManagedInputAuthority } from '../localExecution/GarmentMeshWarpManagedInputAuthority.ts';
import { GarmentMeshWarpInputDeliveryService } from '../localExecution/GarmentMeshWarpInputDeliveryService.ts';
import { GarmentTextureCompositeFinalRecoveryAuthority } from '../localExecution/GarmentTextureCompositeFinalRecoveryAuthority.ts';
import { FashionTryOnOpaqueCandidateSubmissionService } from '../localExecution/FashionTryOnOpaqueCandidateSubmissionService.ts';
import { FashionTryOnOpaqueInputProjectionService } from '../localExecution/FashionTryOnOpaqueInputProjectionService.ts';
import { FashionTryOnOpaqueTerminalReplayGuard } from '../localExecution/FashionTryOnOpaqueTerminalReplayGuard.ts';
import { LocalGarmentMeshWarpExecutionService, type LocalGarmentMeshWarpResourceLimits } from '../localExecution/LocalGarmentMeshWarpExecutionService.ts';
import type { PostgresLocalExecutionUploadStore } from '../localExecution/PostgresLocalExecutionUploadStore.ts';
import { createProductionGarmentTextureComposite } from './createProductionGarmentTextureComposite.ts';

export type ProductionGarmentMeshWarpCompositionInput = Readonly<{
  nodeEnv: string;
  pool: Pool;
  canonical: CreativeExecutionPlatformRuntimeDependencies;
  artifacts: ArtifactAuthority;
  admission: LocalExecutionLedgerV2;
  uploads: PostgresLocalExecutionUploadStore;
  limits: LocalGarmentMeshWarpResourceLimits;
  now: () => number;
}>;

type GarmentMeshWarpExecutionSurface = LocalGarmentMeshWarpExecutionService & Readonly<{
  readiness: FashionTryOnReadinessService;
}>;

/**
 * One production composition root for the shared F4b deterministic Try-On graph.
 *
 * Every product service below reuses the same Garment/representation/body-anchor,
 * immutable warp-layer, artifact, ledger and upload authorities already accepted
 * by F4b.4/F4b.5b. No duplicate store graph, ticket issuer, replay table or result
 * admission path is constructed.
 *
 * Internal orchestration may retain executionId/ticketId for durable binding, but
 * the product facade projects successful prepare/continue results immediately to
 * the accepted non-authorizing PreparedExecutionDescriptor. Browser input and
 * candidate traffic re-enters the accepted opaque projection/submission services.
 *
 * Construction alone does not activate Try-On UI or remove the legacy low-level
 * HTTP routes; that atomic transport cutover remains a separate acceptance gate.
 */
export async function createProductionGarmentMeshWarp(input: ProductionGarmentMeshWarpCompositionInput) {
  await ensureFashionWarpSchemas(input.pool, input.nodeEnv);
  const limits = Object.freeze({
    maxDimension: Math.min(input.limits.maxDimension, GARMENT_MESH_WARP_MAX_DIMENSION),
    maxPixels: Math.min(input.limits.maxPixels, GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS),
    maxUploadBytes: input.limits.maxUploadBytes,
  });
  const garments = new PostgresGarmentStore(input.pool);
  const wardrobe = new PostgresGarmentWardrobeStore(input.pool);
  const representations = new PostgresGarmentRepresentationStore(input.pool);
  const manualParametricAdmission = new ManualParametricGarmentAdmissionService(representations);
  const genericManagedInputs = new ManagedGarmentLocalExecutionInputAuthority({ garments, representations });
  const managedInputs = new GarmentMeshWarpManagedInputAuthority(genericManagedInputs, limits);
  const bodyAnchors = new PostgresProjectBodyAnchorStore(input.pool, { wardrobe, representations, managedInputs });
  const manualBodyAnchorAcquisition = new ManualProjectBodyAnchorAcquisitionService({
    artifacts: input.artifacts,
    bodyAnchors,
  });
  const layers = new PostgresGarmentWarpLayerStore(input.pool);
  const tryOnReadiness = new FashionTryOnReadinessService({
    pool: input.pool,
    artifacts: input.artifacts,
    wardrobe,
    representations,
    bodyAnchors,
  });
  const inputDelivery = new GarmentMeshWarpInputDeliveryService({
    admission: input.admission,
    managedInputs,
    bodyAnchors,
    artifacts: input.artifacts,
    now: input.now,
  });
  const execution = new LocalGarmentMeshWarpExecutionService({
    platform: input.canonical,
    artifacts: input.artifacts,
    managedInputs,
    bodyAnchors,
    delivery: inputDelivery,
    admission: input.admission,
    uploads: input.uploads,
    layers,
    limits,
    now: input.now,
  });
  Object.defineProperty(execution, 'readiness', {
    value: tryOnReadiness,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  const executionSurface = execution as GarmentMeshWarpExecutionSurface;

  const tickets = input.canonical.localExecutionV2;
  if (!tickets) throw new Error('Production Fashion texture composition requires the Core v2 local ticket issuer');
  const textureComposite = createProductionGarmentTextureComposite({
    artifacts: input.artifacts,
    fashion: Object.freeze({ genericManagedInputs, bodyAnchors, layers }),
    tickets,
    admission: input.admission,
    uploads: input.uploads,
    maxUploadBytes: input.limits.maxUploadBytes,
    issueFinalId: (storageId, scope) => input.artifacts.external.issueStoredFinal(storageId, scope),
    now: input.now,
  });

  const finalRecovery = new GarmentTextureCompositeFinalRecoveryAuthority({
    admission: input.admission,
    images: input.artifacts.images,
    issueFinalId: (storageId, scope) => input.artifacts.external.issueStoredFinal(storageId, scope),
  });
  const tryOnWarp = new FashionTryOnWarpOrchestrationService({
    readiness: tryOnReadiness,
    garmentWarp: execution,
  });
  const tryOnTexture = new FashionTryOnTextureContinuationService({
    readiness: tryOnReadiness,
    layers,
    textureComposite: textureComposite.execution,
  });
  const tryOnResult = new FashionTryOnFinalResultService({
    readiness: tryOnReadiness,
    finalRecovery,
  });
  const tryOnPreview = new FashionTryOnRecoveryPreviewService({
    result: tryOnResult,
    delivery: Object.freeze({
      resolveFinalEvidence: (scope, artifactId) => input.artifacts.resolveStoredImageEvidence(scope, artifactId),
      mintFinalDelivery: (scope, storageId, expiresAt) => {
        const token = input.artifacts.external.issueStoredFinalDelivery(storageId, scope, expiresAt);
        return `/api/core/artifacts/results/${encodeURIComponent(token)}`;
      },
    }),
    now: input.now,
  });

  const opaqueInputs = new FashionTryOnOpaqueInputProjectionService({
    admission: input.admission,
    garmentWarp: inputDelivery,
    textureComposite: textureComposite.inputDelivery,
    now: input.now,
  });
  const terminalReplay = new FashionTryOnOpaqueTerminalReplayGuard({
    admission: input.admission,
    layers,
    finals: input.artifacts.images,
  });
  const opaqueCandidates = new FashionTryOnOpaqueCandidateSubmissionService({
    admission: input.admission,
    garmentWarp: execution,
    textureComposite: textureComposite.execution,
    terminalReplay,
  });
  const tryOnProduct = new FashionTryOnProductService({
    warp: tryOnWarp,
    texture: tryOnTexture,
    inputs: opaqueInputs,
    candidates: opaqueCandidates,
    result: tryOnResult,
    preview: tryOnPreview,
  });
  const tryOn = Object.freeze({
    readiness: tryOnReadiness,
    product: tryOnProduct,
  });

  return Object.freeze({
    execution: executionSurface,
    inputDelivery,
    managedInputs,
    genericManagedInputs,
    garments,
    wardrobe,
    representations,
    bodyAnchors,
    layers,
    textureComposite,
    tryOnReadiness,
    tryOn,
    manualParametricAdmission,
    manualBodyAnchorAcquisition,
  });
}

async function ensureFashionWarpSchemas(pool: Pool, nodeEnv: string): Promise<void> {
  if (nodeEnv === 'test') {
    await migrateGarmentSchema(pool);
    await migrateProjectBodyAnchorSchema(pool);
    await migrateGarmentWarpLayerSchema(pool);
    await migrateGarmentTextureFinalLineageSchema(pool);
    return;
  }
  await checkGarmentSchema(pool);
  await checkProjectBodyAnchorSchema(pool);
  await checkGarmentWarpLayerSchema(pool);
  await checkGarmentTextureFinalLineageSchema(pool);
}
