import type { FashionTryOnPreparedExecutionDescriptorV1 } from '../../../src/platform/creative/canonical/fashionTryOnPreparedExecution.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { FashionTryOnOpaqueCandidateCommand, FashionTryOnOpaqueCandidateResult, FashionTryOnOpaqueCandidateSubmissionService } from '../localExecution/FashionTryOnOpaqueCandidateSubmissionService.ts';
import type { FashionTryOnOpaqueInputProjectionService, FashionTryOnPreparedLookup } from '../localExecution/FashionTryOnOpaqueInputProjectionService.ts';
import type { FashionTryOnFinalResult, FashionTryOnFinalResultService } from './FashionTryOnFinalResultService.ts';
import type { FashionTryOnOrchestrationIntentV1 } from './FashionTryOnOrchestrationContract.ts';
import type { FashionTryOnRecoveryPreviewResult, FashionTryOnRecoveryPreviewService } from './FashionTryOnRecoveryPreviewService.ts';
import type { FashionTryOnTextureContinuationService } from './FashionTryOnTextureContinuationService.ts';
import type { FashionTryOnWarpOrchestrationService } from './FashionTryOnWarpOrchestrationService.ts';

type WarpOrchestrator = Pick<FashionTryOnWarpOrchestrationService, 'prepare'>;
type TextureContinuation = Pick<FashionTryOnTextureContinuationService, 'continue'>;
type InputProjection = Pick<FashionTryOnOpaqueInputProjectionService,
  | 'describeGarmentWarp'
  | 'loadGarmentWarpInput'
  | 'describeTextureComposite'
  | 'loadTextureCompositeInput'
>;
type CandidateSubmission = Pick<FashionTryOnOpaqueCandidateSubmissionService,
  | 'submitGarmentWarpCandidate'
  | 'submitTextureCompositeCandidate'
>;
type FinalResult = Pick<FashionTryOnFinalResultService, 'result'>;
type RecoveryPreview = Pick<FashionTryOnRecoveryPreviewService, 'preview'>;

export type FashionTryOnProductDependencies = Readonly<{
  warp: WarpOrchestrator;
  texture: TextureContinuation;
  inputs: InputProjection;
  candidates: CandidateSubmission;
  result: FinalResult;
  /** Optional only for isolated pre-preview fixtures. Production composition must provide it. */
  preview?: RecoveryPreview;
}>;

export type FashionTryOnProductPrepareResult =
  | Awaited<ReturnType<WarpOrchestrator['prepare']>> & Readonly<{ status: 'PREREQUISITE' }>
  | Readonly<{
      status: 'WARP_PREPARED';
      projectId: string;
      sourceArtifactId: string;
      garmentId: string;
      categoryGroup: 'tops' | 'bottoms' | 'dresses' | 'footwear';
      preparedExecution: FashionTryOnPreparedExecutionDescriptorV1;
    }>;

export type FashionTryOnProductContinueResult =
  | Awaited<ReturnType<TextureContinuation['continue']>> & Readonly<{ status: 'PREREQUISITE' | 'WARP_PENDING' }>
  | Readonly<{
      status: 'TEXTURE_PREPARED';
      projectId: string;
      sourceArtifactId: string;
      garmentId: string;
      preparedExecution: FashionTryOnPreparedExecutionDescriptorV1;
    }>;

/**
 * Product-facing deterministic Try-On facade.
 *
 * Internal orchestration services are allowed to know executionId/ticketId so
 * they can bind server-owned readiness and durable LocalExecution state. This
 * facade is the boundary where those internal results are projected into the
 * non-authorizing PreparedExecutionDescriptor accepted by the browser path.
 *
 * The random ticketId survives only inside that descriptor as an opaque lookup
 * handle. executionId, representation/anchor/layer identities, storage/SHA
 * lineage and LocalExecutionResultV2 never cross this product surface.
 *
 * Input/candidate methods do not create a second authority: they delegate to the
 * accepted opaque projector and candidate bridge. FINAL lookup and recovery
 * preview delegate to the accepted stable-intent result/current-evidence chain.
 * No Project Accept/history mutation, provider, Billing or cloud fallback exists
 * here.
 */
export class FashionTryOnProductService {
  constructor(private readonly dependencies: FashionTryOnProductDependencies) {}

  async prepare(
    input: FashionTryOnOrchestrationIntentV1 | unknown,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnProductPrepareResult> {
    const result = await this.dependencies.warp.prepare(input, auth);
    if (result.status === 'PREREQUISITE') return result;

    const preparedExecution = await this.dependencies.inputs.describeGarmentWarp(Object.freeze({
      ticketId: result.ticketId,
      projectId: result.projectId,
    }), auth);
    return Object.freeze({
      status: 'WARP_PREPARED',
      projectId: result.projectId,
      sourceArtifactId: result.sourceArtifactId,
      garmentId: result.garmentId,
      categoryGroup: result.categoryGroup,
      preparedExecution,
    });
  }

  async continue(
    input: FashionTryOnOrchestrationIntentV1 | unknown,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnProductContinueResult> {
    const result = await this.dependencies.texture.continue(input, auth);
    if (result.status !== 'TEXTURE_PREPARED') return result;

    const preparedExecution = await this.dependencies.inputs.describeTextureComposite(Object.freeze({
      ticketId: result.ticketId,
      projectId: result.projectId,
    }), auth);
    return Object.freeze({
      status: 'TEXTURE_PREPARED',
      projectId: result.projectId,
      sourceArtifactId: result.sourceArtifactId,
      garmentId: result.garmentId,
      preparedExecution,
    });
  }

  loadGarmentWarpInput(input: FashionTryOnPreparedLookup, auth: AuthenticatedScope): Promise<Uint8Array> {
    return this.dependencies.inputs.loadGarmentWarpInput(input, auth);
  }

  submitGarmentWarpCandidate(input: FashionTryOnOpaqueCandidateCommand, auth: AuthenticatedScope): Promise<FashionTryOnOpaqueCandidateResult> {
    return this.dependencies.candidates.submitGarmentWarpCandidate(input, auth);
  }

  loadTextureCompositeInput(input: FashionTryOnPreparedLookup, auth: AuthenticatedScope): Promise<Uint8Array> {
    return this.dependencies.inputs.loadTextureCompositeInput(input, auth);
  }

  submitTextureCompositeCandidate(input: FashionTryOnOpaqueCandidateCommand, auth: AuthenticatedScope): Promise<FashionTryOnOpaqueCandidateResult> {
    return this.dependencies.candidates.submitTextureCompositeCandidate(input, auth);
  }

  result(input: FashionTryOnOrchestrationIntentV1 | unknown, auth: AuthenticatedScope): Promise<FashionTryOnFinalResult> {
    return this.dependencies.result.result(input, auth);
  }

  preview(input: FashionTryOnOrchestrationIntentV1 | unknown, auth: AuthenticatedScope): Promise<FashionTryOnRecoveryPreviewResult> {
    if (!this.dependencies.preview) {
      return Promise.reject(Object.assign(new Error('Try-On recovery preview is not configured'), {
        status: 500,
        code: 'fashion_tryon_preview_not_configured',
      }));
    }
    return this.dependencies.preview.preview(input, auth);
  }
}
