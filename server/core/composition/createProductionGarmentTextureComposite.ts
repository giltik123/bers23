import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import { GarmentTextureCompositeEvidenceAuthority } from '../fashion/GarmentTextureCompositeEvidenceAuthority.ts';
import type { PostgresGarmentWarpLayerStore } from '../fashion/postgresGarmentWarpLayerStore.ts';
import type { PostgresProjectBodyAnchorStore } from '../fashion/postgresProjectBodyAnchorStore.ts';
import { GarmentTextureCompositeInputDeliveryService } from '../localExecution/GarmentTextureCompositeInputDeliveryService.ts';
import { LocalGarmentTextureCompositeExecutionService } from '../localExecution/LocalGarmentTextureCompositeExecutionService.ts';
import type { LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';
import type { ManagedGarmentLocalExecutionInputAuthority } from '../localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';
import type { PostgresLocalExecutionUploadStore } from '../localExecution/PostgresLocalExecutionUploadStore.ts';
import { GarmentTextureCompositeSubmissionAuthority } from '../localExecution/GarmentTextureCompositeSubmissionAuthority.ts';
import type { LocalExecutionTicketV2IssuerPort } from '../../../src/platform/creative/canonical/localExecution.ts';
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
  tickets: LocalExecutionTicketV2IssuerPort;
  admission: LocalExecutionLedgerV2;
  uploads: PostgresLocalExecutionUploadStore;
  maxUploadBytes: number;
  issueFinalId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
  now: () => number;
}>;

/**
 * Production composition root for deterministic F4b.5b texture composition.
 *
 * The root reuses the exact F4b.4 Project/Garment/body-anchor/layer authorities;
 * it never constructs a second Fashion store graph. Construction alone is still
 * insufficient for browser reachability: server registration and the independent
 * production route/target/capability/executor gates remain separate boundaries.
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
