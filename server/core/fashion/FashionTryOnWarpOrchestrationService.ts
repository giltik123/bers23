import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type {
  FashionTryOnReadinessFailure,
  FashionTryOnReadinessService,
} from './FashionTryOnReadinessService.ts';
import {
  fashionTryOnPhaseRequestIds,
  normalizeFashionTryOnOrchestrationIntent,
  type FashionTryOnOrchestrationIntentV1,
} from './FashionTryOnOrchestrationContract.ts';
import type { LocalGarmentMeshWarpExecutionService } from '../localExecution/LocalGarmentMeshWarpExecutionService.ts';

type ReadinessResolver = Pick<FashionTryOnReadinessService, 'resolve'>;
type GarmentWarpPreparer = Pick<LocalGarmentMeshWarpExecutionService, 'prepare'>;

export type FashionTryOnWarpOrchestrationDependencies = Readonly<{
  readiness: ReadinessResolver;
  garmentWarp: GarmentWarpPreparer;
}>;

export type FashionTryOnWarpOrchestrationResult =
  | Readonly<{
      status: 'PREREQUISITE';
      readiness: FashionTryOnReadinessFailure;
    }>
  | Readonly<{
      status: 'WARP_PREPARED';
      projectId: string;
      sourceArtifactId: string;
      garmentId: string;
      categoryGroup: 'tops' | 'bottoms' | 'dresses' | 'footwear';
      executionId: string;
      ticketId: string;
    }>;

/**
 * First executable F4b.6 coordinator phase.
 *
 * Browser/client intent contains no representation or body-anchor identity.
 * Those evidence IDs are supplied exclusively by the internal readiness resolver
 * and immediately consumed by the existing F4b.4 prepare authority.
 *
 * The durable LocalExecutionTicketV2 remains inside Core/ledger authority. The
 * orchestration result exposes only its opaque ticketId plus stable product
 * intent and execution identity; internal operation parameters, managed inputs,
 * storage identities and evidence hashes are never projected outward here.
 *
 * No DB table, provider, Billing, FINAL or Project mutation authority exists here.
 */
export class FashionTryOnWarpOrchestrationService {
  constructor(private readonly dependencies: FashionTryOnWarpOrchestrationDependencies) {}

  async prepare(
    input: FashionTryOnOrchestrationIntentV1 | unknown,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnWarpOrchestrationResult> {
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
    const prepared = await this.dependencies.garmentWarp.prepare(Object.freeze({
      projectId: intent.projectId,
      sourceArtifactId: intent.sourceArtifactId,
      garmentId: intent.garmentId,
      representationId: resolution.representationId,
      anchorSetId: resolution.anchorSetId,
      clientRequestId: phaseIds.garmentWarp,
    }), auth);

    return Object.freeze({
      status: 'WARP_PREPARED',
      projectId: intent.projectId,
      sourceArtifactId: intent.sourceArtifactId,
      garmentId: intent.garmentId,
      categoryGroup: resolution.categoryGroup,
      executionId: prepared.executionId,
      ticketId: prepared.ticket.ticketId,
    });
  }
}
