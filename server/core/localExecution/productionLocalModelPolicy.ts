import manifest from '../../../src/platform/creative/local-ai/models/interactive-segmentation.manifest.json' with { type: 'json' };
import type { LocalExecutionModelBinding } from '../../../src/platform/creative/canonical/localExecution.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';
import { superResolutionReleaseState } from '../../../src/platform/creative/super-resolution/SuperResolutionRelease.ts';

export { isExecutableRealEsrganRelease } from '../../../src/platform/creative/super-resolution/SuperResolutionRelease.ts';

export const MOBILE_SAM_LOCAL_CAPABILITY = 'local:mobilesam:segment:v1' as const;
export const REAL_ESRGAN_LOCAL_CAPABILITY = 'local:realesrgan:upscale:v1' as const;

const approvedMobileSam: readonly LocalExecutionModelBinding[] = manifest.status === 'PRODUCTION_APPROVED'
  ? Object.freeze([Object.freeze({ modelId: String(manifest.modelId), version: String(manifest.version) })])
  : Object.freeze([]);

/**
 * Legacy v1 executable model policy. It intentionally remains MobileSAM-only.
 * The C5B composite segment capability aliases this exact release decision rather
 * than creating an independent model-trust authority. MobileSAM is PRODUCTION_APPROVED
 * (see docs/v1-mobilesam-segmentation-production-evidence.md), so both the standalone
 * and the composite catalog bind the exact manifest model identity; any regression of
 * the manifest status makes ticket minting fail closed again.
 */
export const productionLocalModelsByCapability: Readonly<Record<string, readonly LocalExecutionModelBinding[]>> = Object.freeze({
  [MOBILE_SAM_LOCAL_CAPABILITY]: approvedMobileSam,
  [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment]: approvedMobileSam,
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
