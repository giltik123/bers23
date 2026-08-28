import upscaleManifest from '../../../src/platform/creative/local-ai/models/super-resolution.manifest.json' with { type: 'json' };
import type { LocalExecutionExecutorBinding } from '../../../src/platform/creative/canonical/localExecution.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';
import { BACKGROUND_ISOLATION_CAPABILITY, BACKGROUND_ISOLATION_TOOL_ID, BACKGROUND_ISOLATION_TOOL_VERSION } from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import { REAL_ESRGAN_LOCAL_CAPABILITY, isExecutableRealEsrganRelease } from './productionLocalModelPolicy.ts';

const backgroundIsolationExecutor = Object.freeze({
  kind: 'DETERMINISTIC_TOOL',
  toolId: BACKGROUND_ISOLATION_TOOL_ID,
  version: BACKGROUND_ISOLATION_TOOL_VERSION,
} satisfies LocalExecutionExecutorBinding);
const backgroundIsolationExecutors = Object.freeze([backgroundIsolationExecutor]);

const realEsrganExecutors: readonly LocalExecutionExecutorBinding[] = isExecutableRealEsrganRelease(upscaleManifest)
  ? Object.freeze([Object.freeze({
      kind: 'MODEL',
      modelId: String(upscaleManifest.modelId),
      version: String(upscaleManifest.version),
    } satisfies LocalExecutionExecutorBinding)])
  : Object.freeze([]);

/**
 * Production v2 executor policy. Deterministic tools and model executors share the
 * ticket authority but remain exact-kind bound. The C5B composite capability points
 * at the exact same deterministic Background Isolation executor binding; it does not
 * create a second tool-trust decision. Real-ESRGAN remains independently gated.
 */
export const productionLocalExecutorsByCapability: Readonly<Record<string, readonly LocalExecutionExecutorBinding[]>> = Object.freeze({
  [BACKGROUND_ISOLATION_CAPABILITY]: backgroundIsolationExecutors,
  [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation]: backgroundIsolationExecutors,
  [REAL_ESRGAN_LOCAL_CAPABILITY]: realEsrganExecutors,
});