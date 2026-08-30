import type { Pool } from 'pg';
import type { CreativeExecutionPlatformRuntimeDependencies } from '../../../src/platform/creative/canonical/index.ts';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import { checkGarmentSchema, migrateGarmentSchema } from '../fashion/garmentSchema.ts';
import { checkProjectBodyAnchorSchema, migrateProjectBodyAnchorSchema } from '../fashion/bodyAnchorSchema.ts';
import { checkGarmentWarpLayerSchema, migrateGarmentWarpLayerSchema } from '../fashion/garmentWarpLayerSchema.ts';
import { PostgresGarmentStore } from '../fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../fashion/postgresGarmentRepresentationStore.ts';
import { PostgresProjectBodyAnchorStore } from '../fashion/postgresProjectBodyAnchorStore.ts';
import { PostgresGarmentWarpLayerStore } from '../fashion/postgresGarmentWarpLayerStore.ts';
import type { LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';
import { ManagedGarmentLocalExecutionInputAuthority } from '../localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';
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
 * production route/target/executor allowlists and cannot flip the admission bit.
 * It only assembles already-reviewed stores/services after exact schema readiness.
 */
export async function createProductionGarmentMeshWarp(input: ProductionGarmentMeshWarpCompositionInput) {
  await ensureFashionWarpSchemas(input.pool, input.nodeEnv);
  const garments = new PostgresGarmentStore(input.pool);
  const wardrobe = new PostgresGarmentWardrobeStore(input.pool);
  const representations = new PostgresGarmentRepresentationStore(input.pool);
  const managedInputs = new ManagedGarmentLocalExecutionInputAuthority({ garments, representations });
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
    limits: input.limits,
    now: input.now,
  });
  return Object.freeze({ execution, inputDelivery, managedInputs, garments, wardrobe, representations, bodyAnchors, layers });
}

async function ensureFashionWarpSchemas(pool: Pool, nodeEnv: string): Promise<void> {
  if (nodeEnv === 'test') {
    await migrateGarmentSchema(pool);
    await migrateProjectBodyAnchorSchema(pool);
    await migrateGarmentWarpLayerSchema(pool);
    return;
  }
  await checkGarmentSchema(pool);
  await checkProjectBodyAnchorSchema(pool);
  await checkGarmentWarpLayerSchema(pool);
}
