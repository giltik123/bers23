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
import type { GarmentTextureCompositeFinalRecoveryAuthority } from '../localExecution/GarmentTextureCompositeFinalRecoveryAuthority.ts';

type ReadinessResolver = Pick<FashionTryOnReadinessService, 'resolve'>;
type FinalRecovery = Pick<GarmentTextureCompositeFinalRecoveryAuthority, 'recoverForIntent'>;

export type FashionTryOnFinalResultDependencies = Readonly<{
  readiness: ReadinessResolver;
  finalRecovery: FinalRecovery;
}>;

type StableResultContext = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  garmentId: string;
}>;

export type FashionTryOnFinalResult =
  | Readonly<{
      status: 'PREREQUISITE';
      readiness: FashionTryOnReadinessFailure;
    }>
  | (StableResultContext & Readonly<{ status: 'TEXTURE_NOT_PREPARED' }>)
  | (StableResultContext & Readonly<{ status: 'TEXTURE_PENDING' }>)
  | (StableResultContext & Readonly<{ status: 'TEXTURE_FAILED' }>)
  | (StableResultContext & Readonly<{
      status: 'FINAL_READY';
      artifactId: string;
    }>);

/**
 * Read-only F4b.6 result coordinator.
 *
 * The caller supplies only the same closed one-garment intent used by prepare
 * and continue. Core first re-runs current readiness, then derives the exact
 * texture phase request identity server-side and asks the purpose-bound FINAL
 * recovery authority to prove that the durable texture ticket belongs to this
 * exact sourceArtifactId + garmentId before exposing a signed FINAL candidate.
 *
 * No ticket, execution, storage, immutable-layer or FINAL identity is accepted
 * from the caller. This service never Accepts Project, mutates history, admits
 * result pixels or invokes provider/Billing/cloud authority.
 */
export class FashionTryOnFinalResultService {
  constructor(private readonly dependencies: FashionTryOnFinalResultDependencies) {}

  async result(
    input: FashionTryOnOrchestrationIntentV1 | unknown,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnFinalResult> {
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
    const recovered = await this.dependencies.finalRecovery.recoverForIntent(Object.freeze({
      projectId: intent.projectId,
      clientRequestId: phaseIds.textureComposite,
      sourceArtifactId: intent.sourceArtifactId,
      garmentId: intent.garmentId,
    }), auth);
    const context = Object.freeze({
      projectId: intent.projectId,
      sourceArtifactId: intent.sourceArtifactId,
      garmentId: intent.garmentId,
    });

    switch (recovered.status) {
      case 'NOT_PREPARED':
        return Object.freeze({ ...context, status: 'TEXTURE_NOT_PREPARED' });
      case 'PENDING':
        return Object.freeze({ ...context, status: 'TEXTURE_PENDING' });
      case 'FAILED':
        return Object.freeze({ ...context, status: 'TEXTURE_FAILED' });
      case 'SUCCESS':
        return Object.freeze({ ...context, status: 'FINAL_READY', artifactId: recovered.artifactId });
      default: {
        const unreachable: never = recovered;
        return unreachable;
      }
    }
  }
}
