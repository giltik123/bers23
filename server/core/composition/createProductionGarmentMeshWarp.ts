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
import { PostgresGarmentStore } from '../fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../fashion/postgresGarmentRepresentationStore.ts';
import { PostgresProjectBodyAnchorStore } from '../fashion/postgresProjectBodyAnchorStore.ts';
import { PostgresGarmentWarpLayerStore } from '../fashion/postgresGarmentWarpLayerStore.ts';
import type { LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';
import { ManagedGarmentLocalExecutionInputAuthority } from '../localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';
import { GarmentMeshWarpManagedInputAuthority } from '../localExecution/GarmentMeshWarpManagedInputAuthority.ts';
import { GarmentMeshWarpInputDeliveryService } from '../localExecution/GarmentMeshWarpInputDeliveryService.ts';
import { LocalGarmentMeshWarpExecutionService, type LocalGarmentMeshWarpResourceLimits } from '../localExecution/LocalGarmentMeshWarpExecutionService.ts';
import type { PostgresLocalExecutionUploadStore } from '../localExecution/PostgresLocalExecutionUploadStore.ts';

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

/**
 * One production composition root for F4b.4 authority.
 *
 * The factory is intentionally policy-neutral: it does not add the capability to
 * production route/target/executor allowlists and cannot flip an admission bit.
 * F4b.5b.1 only extends durable schema readiness after the already-admitted warp
 * layer; it still does not wire garment-texture-composite execution.
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
  const genericManagedInputs = new ManagedGarmentLocalExecutionInputAuthority({ garments, representations });
  const managedInputs = new GarmentMeshWarpManagedInputAuthority(genericManagedInputs, limits);
  const bodyAnchors = new PostgresProjectBodyAnchorStore(input.pool, { wardrobe, representations, managedInputs });
  const layers = new PostgresGarmentWarpLayerStore(input.pool);
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
  return Object.freeze({ execution, inputDelivery, managedInputs, garments, wardrobe, representations, bodyAnchors, layers });
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
