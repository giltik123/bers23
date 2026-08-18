import { coreClient } from '@/api/coreClient';

const publicStatus = Object.freeze({ SUCCESS: 'completed', FAILED: 'failed', UNKNOWN: 'pending', WAITING: 'queued', READY: 'preparing', RUNNING: 'generating', VERIFYING: 'verifying', RECOVERING: 'pending', SKIPPED: 'cancelled' });

/** Thin product adapter. All planning, provider selection, billing and execution remain server authoritative. */
export const creativeEditApplicationService = Object.freeze({
  async execute(input) {
    const outcome = await coreClient.creative.execute({
      projectId: input.projectId,
      instruction: input.instruction.trim(),
      selectedObjectIds: input.selectedObjectIds ?? [],
      inputArtifactId: input.inputArtifactId,
      maskArtifactIds: input.maskArtifactIds ?? [],
      preserveMode: input.preserveMode,
      clientRequestId: input.clientRequestId,
    });
    return {
      executionId: outcome.executionId,
      status: publicStatus[outcome.status] ?? 'pending',
      imageUrl: outcome.imageUrl ?? outcome.artifacts?.find((artifact) => artifact.kind === 'image')?.url,
      artifacts: outcome.artifacts ?? [],
      verification: outcome.verification,
      creditsUsed: outcome.creditsUsed,
      provider: outcome.provider,
      timing: outcome.timing,
    };
  },
  cancel: (executionId) => coreClient.creative.cancel(executionId),
  status: (executionId) => coreClient.creative.status(executionId),
});
