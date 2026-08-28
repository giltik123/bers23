import upscaleManifest from '../../../src/platform/creative/local-ai/models/super-resolution.manifest.json' with { type: 'json' };
import type { LocalExecutionExecutorBinding } from '../../../src/platform/creative/canonical/localExecution.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';
import { BACKGROUND_ISOLATION_CAPABILITY } from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import { CROP_CAPABILITY } from '../../../src/platform/creative/deterministic/Crop.ts';
import { requireDeterministicToolByCapability } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { REAL_ESRGAN_LOCAL_CAPABILITY, isExecutableRealEsrganRelease } from './productionLocalModelPolicy.ts';

const backgroundIsolationTool = requireDeterministicToolByCapability(BACKGROUND_ISOLATION_CAPABILITY);
const backgroundIsolationExecutors = Object.freeze([backgroundIsolationTool.executor]);
const cropTool = requireDeterministicToolByCapability(CROP_CAPABILITY);
const cropExecutors = Object.freeze([cropTool.executor]);

const realEsrganExecutors: readonly LocalExecutionExecutorBinding[] = isExecutableRealEsrganRelease(upscaleManifest)
  ? Object.freeze([Object.freeze({
      kind: 'MODEL',
      modelId: String(upscaleManifest.modelId),
      version: String(upscaleManifest.version),
    } satisfies LocalExecutionExecutorBinding)])
  : Object.freeze([]);

/**
 * Production v2 executor policy. The deterministic registry describes reviewed
 * contracts but does not auto-admit them: every production capability remains an
 * explicit key here. C5B deliberately reuses the exact registered Background
 * Isolation executor rather than creating a second tool-trust decision.
 */
export const productionLocalExecutorsByCapability: Readonly<Record<string, readonly LocalExecutionExecutorBinding[]>> = Object.freeze({
  [BACKGROUND_ISOLATION_CAPABILITY]: backgroundIsolationExecutors,
  [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation]: backgroundIsolationExecutors,
  [CROP_CAPABILITY]: cropExecutors,
  [REAL_ESRGAN_LOCAL_CAPABILITY]: realEsrganExecutors,
});
