import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { FashionTryOnReadinessService } from './FashionTryOnReadinessService.ts';
import type { PostgresGarmentWarpLayerStore } from './postgresGarmentWarpLayerStore.ts';
import {
  FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_V1,
  fashionTryOnPhaseRequestIds,
  normalizeFashionTryOnOrchestrationIntent,
  type FashionTryOnOrchestrationIntentV1,
} from './FashionTryOnOrchestrationContract.ts';
import { garmentMeshWarpExecutionId } from '../localExecution/GarmentMeshWarpExecutionContract.ts';
import type { LocalGarmentTextureCompositeExecutionService } from '../localExecution/LocalGarmentTextureCompositeExecutionService.ts';

type ReadinessResolver = Pick<FashionTryOnReadinessService, 'resolve'>;
type WarpLayerReader = Pick<PostgresGarmentWarpLayerStore, 'loadByExecution'>;
type TextureCompositePreparer = Pick<LocalGarmentTextureCompositeExecutionService, 'prepare'>;

export type FashionTryOnTextureContinuationDependencies = Readonly<{
  readiness: ReadinessResolver;
  layers: WarpLayerReader;
  textureComposite: TextureCompositePreparer;
}>;

export type FashionTryOnTextureContinuationResult =
  | Readonly<{
      status: 'PREREQUISITE';
      readiness: Exclude<Awaited<ReturnType<ReadinessResolver['resolve']>>, { status: 'READY' }>;
    }>
  | Readonly<{
      status: 'WARP_PENDING';
      projectId: string;
      sourceArtifactId: string;
      garmentId: string;
    }>
  | Readonly<{
      status: 'TEXTURE_PREPARED';
      projectId: string;
      sourceArtifactId: string;
      garmentId: string;
      executionId: string;
      ticketId: string;
    }>;

/**
 * Second executable F4b.6 coordinator phase.
 *
 * The browser carries no immutable-layer identity. Core reconstructs the exact
 * F4b.4 execution identity from the stable orchestration request, loads only the
 * immutable layer committed by that execution, binds it back to current
 * readiness evidence, then supplies its ID/SHA to the existing F4b.5b prepare
 * authority with closed v1 producer defaults.
 *
 * The F4b.5b durable LocalExecutionTicketV2 remains internal. This coordinator
 * returns only its opaque ticketId plus stable orchestration/execution state and
 * never exposes immutable layer identity, managed inputs or evidence bindings.
 *
 * This service owns no mutable orchestration table, provider/Billing port,
 * Project mutation or FINAL persistence authority.
 */
export class FashionTryOnTextureContinuationService {
  constructor(private readonly dependencies: FashionTryOnTextureContinuationDependencies) {}

  async continue(
    input: FashionTryOnOrchestrationIntentV1 | unknown,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnTextureContinuationResult> {
    const intent = normalizeFashionTryOnOrchestrationIntent(input);
    const resolution = await this.dependencies.readiness.resolve(Object.freeze({
      projectId: intent.projectId,
      sourceArtifactId: intent.sourceArtifactId,
      garmentId: intent.garmentId,
    }), auth);
    if (resolution.status !== 'READY') {
      return Object.freeze({ status: 'PREREQUISITE', readiness: resolution });
    }

    const phaseIds = fashionTryOnPhaseRequestIds(intent.clientRequestId);
    const projectScope = Object.freeze({ ...auth, projectId: intent.projectId });
    const warpExecutionId = garmentMeshWarpExecutionId(projectScope, phaseIds.garmentWarp);
    const layer = await this.dependencies.layers.loadByExecution(
      Object.freeze({ tenantId: auth.tenantId, userId: auth.userId }),
      intent.projectId,
      warpExecutionId,
    );
    if (!layer) {
      return Object.freeze({
        status: 'WARP_PENDING',
        projectId: intent.projectId,
        sourceArtifactId: intent.sourceArtifactId,
        garmentId: intent.garmentId,
      });
    }

    assertLayerMatchesCurrentReadiness(intent, resolution, warpExecutionId, layer);
    const defaults = FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_V1;
    const prepared = await this.dependencies.textureComposite.prepare(Object.freeze({
      projectId: intent.projectId,
      sourceArtifactId: intent.sourceArtifactId,
      garmentWarpLayerId: layer.id,
      garmentWarpLayerSha256: layer.contentSha256,
      textureTransform: defaults.textureTransform,
      featherRadius: defaults.featherRadius,
      clientRequestId: phaseIds.textureComposite,
    }), auth);

    return Object.freeze({
      status: 'TEXTURE_PREPARED',
      projectId: intent.projectId,
      sourceArtifactId: intent.sourceArtifactId,
      garmentId: intent.garmentId,
      executionId: prepared.executionId,
      ticketId: prepared.ticket.ticketId,
    });
  }
}

function assertLayerMatchesCurrentReadiness(
  intent: FashionTryOnOrchestrationIntentV1,
  resolution: Extract<Awaited<ReturnType<ReadinessResolver['resolve']>>, { status: 'READY' }>,
  expectedExecutionId: string,
  layer: Awaited<ReturnType<WarpLayerReader['loadByExecution']>> & {},
): void {
  const mesh = resolution.destinationMesh;
  const p = mesh.provenance;
  const same = layer.executionId === expectedExecutionId
    && layer.projectId === intent.projectId
    && layer.projectImageStorageId === resolution.source.storageId
    && layer.projectImageSha256 === resolution.source.sha256
    && layer.width === resolution.source.width
    && layer.height === resolution.source.height
    && layer.garmentId === intent.garmentId
    && layer.representationId === resolution.representationId
    && layer.representationContentSha256 === p.representationContentSha256
    && layer.anchorSetId === resolution.anchorSetId
    && layer.anchorPayloadSha256 === p.anchorPayloadSha256
    && layer.destinationMeshSha256 === mesh.meshSha256;
  if (!same) {
    throw continuationError(
      409,
      'fashion_tryon_warp_lineage_mismatch',
      'Committed garment warp layer no longer matches the current server-owned Try-On evidence',
    );
  }
}

function continuationError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
