import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import { GarmentTextureCompositeEvidenceAuthority } from '../fashion/GarmentTextureCompositeEvidenceAuthority.ts';
import type { PostgresGarmentWarpLayerStore } from '../fashion/postgresGarmentWarpLayerStore.ts';
import type { PostgresProjectBodyAnchorStore } from '../fashion/postgresProjectBodyAnchorStore.ts';
import { GarmentTextureCompositeInputDeliveryService } from '../localExecution/GarmentTextureCompositeInputDeliveryService.ts';
import { LocalGarmentTextureCompositeExecutionService } from '../localExecution/LocalGarmentTextureCompositeExecutionService.ts';
import type { LocalExecutionTicketAuthority } from '../localExecution/LocalExecutionTicketAuthority.ts';
import type { LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';
import type { ManagedGarmentLocalExecutionInputAuthority } from '../localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';
import type { PostgresLocalExecutionUploadStore } from '../localExecution/PostgresLocalExecutionUploadStore.ts';
import { GarmentTextureCompositeSubmissionAuthority } from '../localExecution/GarmentTextureCompositeSubmissionAuthority.ts';
import { verifyGarmentTextureCompositeFinalArtifact } from '../providers/garmentTextureCompositeWorkflowVerifier.ts';
import { productionGarmentTextureCompositePolicy } from '../providers/productionGarmentTextureCompositePolicy.ts';

export type ProductionGarmentTextureCompositeSharedFashionAuthority = Readonly<{
  genericManagedInputs: ManagedGarmentLocalExecutionInputAuthority;
  bodyAnchors: PostgresProjectBodyAnchorStore;
  layers: PostgresGarmentWarpLayerStore;
}>;

export type ProductionGarmentTextureCompositeCompositionInput = Readonly<{
  artifacts: ArtifactAuthority;
  fashion: ProductionGarmentTextureCompositeSharedFashionAuthority;
  tickets: LocalExecutionTicketAuthority;
  admission: LocalExecutionLedgerV2;
  uploads: PostgresLocalExecutionUploadStore;
  maxUploadBytes: number;
  issueFinalId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
  now: () => number;
}>;

/**
 * Dormant production composition root for deterministic F4b.5b texture composition.
 *
 * The root reuses the exact F4b.4 Project/Garment/body-anchor/layer authorities;
 * it never constructs a second Fashion store graph. Construction alone grants no
 * production execution authority: the injected production policy remains guarded
 * by GARMENT_TEXTURE_COMPOSITE_PRODUCTION_ADMISSION and the independent production
 * route/target/capability tables. HTTP registration is intentionally outside this
 * factory so a partially wired composition still cannot become browser reachable.
 */
export function createProductionGarmentTextureComposite(input: ProductionGarmentTextureCompositeCompositionInput) {
  const evidence = new GarmentTextureCompositeEvidenceAuthority({
    artifacts: input.artifacts,
    managedInputs: input.fashion.genericManagedInputs,
    bodyAnchors: input.fashion.bodyAnchors,
    layers: input.fashion.layers,
  });
  const inputDelivery = new GarmentTextureCompositeInputDeliveryService({
    admission: input.admission,
    evidence,
    now: input.now,
  });
  const submission = new GarmentTextureCompositeSubmissionAuthority({
    admission: input.admission,
    uploads: input.uploads,
    delivery: inputDelivery,
    maxUploadBytes: input.maxUploadBytes,
    completeCanonicalExecution: async ({ ticket, result, artifact }) => (
      verifyGarmentTextureCompositeFinalArtifact(ticket, result, artifact)
    ),
    persistFinal: (scope, executionId, operationId, image, lineage) => (
      input.artifacts.images.persistFinal(scope, executionId, operationId, image, lineage)
    ),
    loadPersistedFinal: (executionId, scope) => input.artifacts.images.loadFinalByExecution(executionId, scope),
    issueFinalId: input.issueFinalId,
    now: input.now,
  });
  const execution = new LocalGarmentTextureCompositeExecutionService({
    tickets: input.tickets,
    admission: input.admission,
    evidence,
    submission,
    policy: productionGarmentTextureCompositePolicy,
    now: input.now,
  });
  return Object.freeze({ execution, inputDelivery, evidence, submission });
}
