import type { LocalExecutionExecutorBinding } from '../../../src/platform/creative/canonical/localExecution.ts';
import { BACKGROUND_ISOLATION_CAPABILITY, BACKGROUND_ISOLATION_TOOL_ID, BACKGROUND_ISOLATION_TOOL_VERSION } from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';

const backgroundIsolationExecutor = Object.freeze({
  kind: 'DETERMINISTIC_TOOL',
  toolId: BACKGROUND_ISOLATION_TOOL_ID,
  version: BACKGROUND_ISOLATION_TOOL_VERSION,
} satisfies LocalExecutionExecutorBinding);

/**
 * Production v2 executor policy. Deterministic tools live here rather than in
 * the signed model fleet so model trust/benchmark semantics remain model-only.
 */
export const productionLocalExecutorsByCapability: Readonly<Record<string, readonly LocalExecutionExecutorBinding[]>> = Object.freeze({
  [BACKGROUND_ISOLATION_CAPABILITY]: Object.freeze([backgroundIsolationExecutor]),
});
