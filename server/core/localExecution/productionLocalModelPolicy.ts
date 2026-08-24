import manifest from '../../../src/platform/creative/local-ai/models/interactive-segmentation.manifest.json' with { type: 'json' };
import type { LocalExecutionModelBinding } from '../../../src/platform/creative/canonical/localExecution.ts';

export const MOBILE_SAM_LOCAL_CAPABILITY = 'local:mobilesam:segment:v1' as const;

const approvedMobileSam: readonly LocalExecutionModelBinding[] = manifest.status === 'PRODUCTION_APPROVED'
  ? Object.freeze([Object.freeze({ modelId: String(manifest.modelId), version: String(manifest.version) })])
  : Object.freeze([]);

/**
 * Core executable model policy. A signed CANDIDATE is discoverable by the device
 * substrate but is not executable authority until the release manifest is explicitly
 * promoted to PRODUCTION_APPROVED.
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
