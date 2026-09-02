import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type {
  FashionTryOnReadinessFailure,
  FashionTryOnReadinessService,
  ResolvedFashionTryOnEvidence,
} from './FashionTryOnReadinessService.ts';
import {
  fashionTryOnPhaseRequestIds,
  normalizeFashionTryOnOrchestrationIntent,
  type FashionTryOnOrchestrationIntentV1,
} from './FashionTryOnOrchestrationContract.ts';
import type {
  GarmentTextureCompositeFinalRecoveryAuthority,
  GarmentTextureCompositeResolvedEvidenceBinding,
} from '../localExecution/GarmentTextureCompositeFinalRecoveryAuthority.ts';

type ReadinessResolver = Pick<FashionTryOnReadinessService, 'resolve'>;
type FinalRecovery = Pick<GarmentTextureCompositeFinalRecoveryAuthority, 'recoverForResolvedEvidence'>;

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
  | (StableResultContext & Readonly<{ status: 'TEXTURE_STALE' }>)
  | (StableResultContext & Readonly<{
      status: 'FINAL_READY';
      artifactId: string;
    }>);

/**
 * Read-only F4b.6 product result coordinator.
 *
 * The caller supplies only the same closed one-garment intent used by prepare
 * and continue. Core resolves current Project/Garment/body-anchor evidence,
 * derives the texture phase request identity server-side and passes an internal
 * current-evidence binding to the purpose-bound FINAL recovery authority.
 * Recovery must prove the durable texture ticket was prepared from that exact
 * Project image, representation, anchor payload and destination mesh before a
 * committed candidate can be considered.
 *
 * A successful recovery is followed by a second full readiness resolution. The
 * two server-owned evidence bindings must remain identical before FINAL_READY is
 * exposed. A pre-existing stale ticket or a concurrent evidence transition is
 * mapped to TEXTURE_STALE without exposing the old artifact identity.
 *
 * No ticket, execution, storage, immutable-layer, representation or anchor
 * identity is accepted from the caller or returned to it. This service never
 * Accepts Project, mutates history, admits result pixels or invokes
 * provider/Billing/cloud authority. A future Try-On product cutover must still
 * preserve current-evidence validation at its final Project mutation boundary.
 */
export class FashionTryOnFinalResultService {
  constructor(private readonly dependencies: FashionTryOnFinalResultDependencies) {}

  async result(
    input: FashionTryOnOrchestrationIntentV1 | unknown,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnFinalResult> {
    const intent = normalizeFashionTryOnOrchestrationIntent(input);
    const readinessCommand = Object.freeze({
      projectId: intent.projectId,
      sourceArtifactId: intent.sourceArtifactId,
      garmentId: intent.garmentId,
    });
    const resolution = await this.dependencies.readiness.resolve(readinessCommand, auth);
    if (resolution.status !== 'READY') return prerequisite(resolution);

    const context = Object.freeze({
      projectId: intent.projectId,
      sourceArtifactId: intent.sourceArtifactId,
      garmentId: intent.garmentId,
    });
    const initialEvidence = currentEvidenceBinding(resolution);
    const phaseIds = fashionTryOnPhaseRequestIds(intent.clientRequestId);

    let recovered: Awaited<ReturnType<FinalRecovery['recoverForResolvedEvidence']>>;
    try {
      recovered = await this.dependencies.finalRecovery.recoverForResolvedEvidence(Object.freeze({
        projectId: intent.projectId,
        clientRequestId: phaseIds.textureComposite,
        sourceArtifactId: intent.sourceArtifactId,
        garmentId: intent.garmentId,
        evidence: initialEvidence,
      }), auth);
    } catch (error) {
      if (isCurrentEvidenceMismatch(error)) return Object.freeze({ ...context, status: 'TEXTURE_STALE' });
      throw error;
    }

    switch (recovered.status) {
      case 'NOT_PREPARED':
        return Object.freeze({ ...context, status: 'TEXTURE_NOT_PREPARED' });
      case 'PENDING':
        return Object.freeze({ ...context, status: 'TEXTURE_PENDING' });
      case 'FAILED':
        return Object.freeze({ ...context, status: 'TEXTURE_FAILED' });
      case 'SUCCESS': {
        const finalResolution = await this.dependencies.readiness.resolve(readinessCommand, auth);
        if (finalResolution.status !== 'READY') return prerequisite(finalResolution);
        if (!sameCurrentEvidence(initialEvidence, currentEvidenceBinding(finalResolution))) {
          return Object.freeze({ ...context, status: 'TEXTURE_STALE' });
        }
        return Object.freeze({ ...context, status: 'FINAL_READY', artifactId: recovered.artifactId });
      }
      default: {
        const unreachable: never = recovered;
        return unreachable;
      }
    }
  }
}

function currentEvidenceBinding(resolution: ResolvedFashionTryOnEvidence): GarmentTextureCompositeResolvedEvidenceBinding {
  const provenance = resolution.destinationMesh.provenance;
  return Object.freeze({
    projectImageStorageId: resolution.source.storageId,
    projectImageSha256: resolution.source.sha256,
    projectImageWidth: resolution.source.width,
    projectImageHeight: resolution.source.height,
    representationId: resolution.representationId,
    representationContentSha256: provenance.representationContentSha256,
    anchorSetId: resolution.anchorSetId,
    anchorPayloadSha256: provenance.anchorPayloadSha256,
    destinationMeshSha256: resolution.destinationMesh.meshSha256,
  });
}

function sameCurrentEvidence(
  left: GarmentTextureCompositeResolvedEvidenceBinding,
  right: GarmentTextureCompositeResolvedEvidenceBinding,
): boolean {
  return left.projectImageStorageId === right.projectImageStorageId
    && left.projectImageSha256 === right.projectImageSha256
    && left.projectImageWidth === right.projectImageWidth
    && left.projectImageHeight === right.projectImageHeight
    && left.representationId === right.representationId
    && left.representationContentSha256 === right.representationContentSha256
    && left.anchorSetId === right.anchorSetId
    && left.anchorPayloadSha256 === right.anchorPayloadSha256
    && left.destinationMeshSha256 === right.destinationMeshSha256;
}

function prerequisite(readiness: FashionTryOnReadinessFailure): FashionTryOnFinalResult {
  return Object.freeze({ status: 'PREREQUISITE', readiness });
}

function isCurrentEvidenceMismatch(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'garment_texture_final_recovery_evidence_mismatch';
}
