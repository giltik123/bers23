import { pipelineDeepFreeze } from './PipelineImmutable';
import type { PipelineGraphSnapshot, PipelineRecoveryAction, PipelineRecoveryPlan } from './ImagePipelineTypes';
import { PipelineOperationRegistry } from './PipelineOperationRegistry';

export class PipelineRecovery {
  constructor(private readonly registry: PipelineOperationRegistry) {}

  plan(graph: PipelineGraphSnapshot, operationId: string, reason: string, preferred?: PipelineRecoveryAction): PipelineRecoveryPlan {
    const operation = graph.operations.find((item) => item.id === operationId);
    if (!operation) throw new Error('Pipeline operation is missing');
    const fallback = this.registry.fallback(operation.operation);
    const action = preferred ?? (fallback ? 'fallback' : operation.verificationRequired ? 'replace' : 'skip');
    const affected = new Set([operationId]);
    const queue = [operationId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const dependency of graph.dependencies.filter((item) => item.source === current)) if (!affected.has(dependency.target)) { affected.add(dependency.target); queue.push(dependency.target); }
    }
    return pipelineDeepFreeze({ operationId, action, fallback: action === 'fallback' ? fallback : undefined, preserveOperationIds: graph.operations.filter((item) => !affected.has(item.id)).map((item) => item.id).sort(), removeOperationIds: [...affected].sort(), reason });
  }
}
