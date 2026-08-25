import upscaleManifest from '../../../src/platform/creative/local-ai/models/super-resolution.manifest.json' with { type: 'json' };
import type { LocalExecutionExecutorBinding } from '../../../src/platform/creative/canonical/localExecution.ts';
import { BACKGROUND_ISOLATION_CAPABILITY, BACKGROUND_ISOLATION_TOOL_ID, BACKGROUND_ISOLATION_TOOL_VERSION } from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import { REAL_ESRGAN_LOCAL_CAPABILITY, isExecutableRealEsrganRelease } from './productionLocalModelPolicy.ts';

const backgroundIsolationExecutor = Object.freeze({
  kind: 'DETERMINISTIC_TOOL',
  toolId: BACKGROUND_ISOLATION_TOOL_ID,
  version: BACKGROUND_ISOLATION_TOOL_VERSION,
} satisfies LocalExecutionExecutorBinding);

const realEsrganExecutors: readonly LocalExecutionExecutorBinding[] = isExecutableRealEsrganRelease(upscaleManifest)
  ? Object.freeze([Object.freeze({
      kind: 'MODEL',
      modelId: String(upscaleManifest.modelId),
      version: String(upscaleManifest.version),
    } satisfies LocalExecutionExecutorBinding)])
  : Object.freeze([]);

/**
 * Production v2 executor policy. Deterministic tools and model executors share the
 * ticket authority but remain exact-kind bound. Real-ESRGAN is deliberately absent
 * until its complete signed release gate is satisfied; it never inherits the v1
 * MobileSAM model catalog implicitly.
 */
export const productionLocalExecutorsByCapability: Readonly<Record<string, readonly LocalExecutionExecutorBinding[]>> = Object.freeze({
  [BACKGROUND_ISOLATION_CAPABILITY]: Object.freeze([backgroundIsolationExecutor]),
  [REAL_ESRGAN_LOCAL_CAPABILITY]: realEsrganExecutors,
});
