import manifest from '../../../src/platform/creative/local-ai/models/interactive-segmentation.manifest.json' with { type: 'json' };
import type { LocalExecutionModelBinding } from '../../../src/platform/creative/canonical/localExecution.ts';
import { superResolutionReleaseState } from '../../../src/platform/creative/super-resolution/SuperResolutionRelease.ts';

export { isExecutableRealEsrganRelease } from '../../../src/platform/creative/super-resolution/SuperResolutionRelease.ts';

export const MOBILE_SAM_LOCAL_CAPABILITY = 'local:mobilesam:segment:v1' as const;
export const REAL_ESRGAN_LOCAL_CAPABILITY = 'local:realesrgan:upscale:v1' as const;

const approvedMobileSam: readonly LocalExecutionModelBinding[] = manifest.status === 'PRODUCTION_APPROVED'
  ? Object.freeze([Object.freeze({ modelId: String(manifest.modelId), version: String(manifest.version) })])
  : Object.freeze([]);

/**
 * Legacy v1 executable model policy. It intentionally remains MobileSAM-only.
 * New image-producing model capabilities use the v2 executor-union policy and must
 * never silently become mintable through the v1 issuer after release promotion.
 */
export const productionLocalModelsByCapability: Readonly<Record<string, readonly LocalExecutionModelBinding[]>> = Object.freeze({
  [MOBILE_SAM_LOCAL_CAPABILITY]: approvedMobileSam,
});

export const mobileSamProductionReleaseState = Object.freeze({
  modelId: String(manifest.modelId),
  version: String(manifest.version),
  releaseStatus: String(manifest.status),
  executable: approvedMobileSam.length === 1,
});

export const realEsrganProductionReleaseState = Object.freeze({
  modelId: superResolutionReleaseState.modelId,
  version: superResolutionReleaseState.version,
  releaseStatus: superResolutionReleaseState.releaseStatus,
  artifactState: superResolutionReleaseState.artifactState,
  executableV2: superResolutionReleaseState.productionAvailable,
  executableV1: false,
});
