import { randomUUID } from 'node:crypto';
import type { ProviderRuntimePort, Artifact, Scope, WorkflowOperation } from '../../../src/platform/creative/workflow-engine/types.ts';
import { composeCreativeProviders } from '../../../src/platform/creative/composition/CreativeProviderComposition.ts';
import { FalProviderError } from '../../../src/platform/creative/providers/fal/FalErrorMapper.ts';
import type { CreativeProvider } from '../../../src/platform/creative/providers/fal/types.ts';
import type { SignedArtifactAuthority } from '../artifacts/signedArtifactAuthority.ts';

export function createFalWorkflowRuntime(input: Readonly<{ apiKey: string; baseUrl: string; timeoutMs: number; artifacts: SignedArtifactAuthority; fetcher?: typeof fetch }>): ProviderRuntimePort {
  const composed = composeCreativeProviders({ fetcher: input.fetcher ?? globalThis.fetch.bind(globalThis), api: { apiKey: input.apiKey, baseUrl: input.baseUrl, timeoutMs: input.timeoutMs, maxRetries: 0 }, clock: Date.now, random: Math.random, id: randomUUID, sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) });
  const provider = composed.registry.resolve('image-edit') as CreativeProvider;
  return Object.freeze({
    async execute(request: Readonly<{ workflowId: string; operation: WorkflowOperation; artifacts: readonly Artifact[]; scope: Scope }>) {
      const source = request.artifacts[0]; if (!source) throw new Error('A canonical input artifact is required');
      const trusted = input.artifacts.resolve(source.id, request.scope);
      try {
        const result = await provider.execute({ id: `${request.workflowId}:${request.operation.id}`, scope: request.scope, capability: 'image-edit', prompt: String(request.operation.input?.prompt ?? ''), imageUrl: trusted.url, timeoutMs: input.timeoutMs, metadata: { executionId: request.workflowId, operationId: request.operation.id, attemptId: `${request.workflowId}:${request.operation.id}:1`, correlationId: request.operation.input?.correlationId } });
        return { artifacts: result.artifacts.map((artifact, index) => ({ id: `${request.workflowId}-output-${index}`, kind: 'image', value: { url: artifact.url, hash: artifact.hash, mimeType: artifact.mimeType } })), latencyMs: result.metrics.latencyMs };
      } catch (cause) {
        if (cause instanceof FalProviderError && cause.category === 'timeout') throw Object.assign(new Error('Provider result requires reconciliation'), { code: 'PROVIDER_RESULT_UNKNOWN', unknownOutcome: true });
        throw cause;
      }
    },
  });
}
