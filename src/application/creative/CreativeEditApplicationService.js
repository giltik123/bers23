import { coreClient } from '@/api/coreClient';

/** Thin product adapter. All planning, provider selection, billing and execution remain server authoritative. */
export const createCreativeEditApplicationService = (client = coreClient) => Object.freeze({
  async execute(input) {
    const execute = client === coreClient ? coreClient.creative.execute : client.creative.execute;
    const outcome = await execute({
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
      status: outcome.status,
      imageUrl: outcome.imageUrl ?? outcome.artifacts?.find((artifact) => artifact.kind === 'image')?.url,
      finalArtifactId: outcome.finalArtifactId,
      artifacts: outcome.artifacts ?? [],
      verification: outcome.verification,
      creditsUsed: outcome.creditsUsed,
      provider: outcome.provider,
      timing: outcome.timing,
    };
  },
  cancel: (executionId) => client.creative.cancel(executionId),
  status: (executionId) => client.creative.status(executionId),
});

export const creativeEditApplicationService = createCreativeEditApplicationService();
