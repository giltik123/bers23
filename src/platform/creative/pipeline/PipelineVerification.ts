import { pipelineDeepFreeze } from './PipelineImmutable';
import type { ImageState, PipelineGraphSnapshot, PipelineVerificationResult } from './ImagePipelineTypes';
import { PipelineOperationRegistry } from './PipelineOperationRegistry';

export class PipelineVerification {
  constructor(private readonly registry: PipelineOperationRegistry) {}

  verify(graph: PipelineGraphSnapshot, states: readonly ImageState[]): readonly PipelineVerificationResult[] {
    return pipelineDeepFreeze(graph.operations.map((operation, index) => {
      const definition = this.registry.resolve(operation.operation)!;
      const current = states[index + 1] ?? states.at(-1)!;
      const expected = definition.effects;
      const issues: string[] = [];
      if (expected.width !== undefined && current.width !== expected.width) issues.push('resolution width mismatch');
      if (expected.height !== undefined && current.height !== expected.height) issues.push('resolution height mismatch');
      if (expected.format !== undefined && current.format !== expected.format) issues.push('format mismatch');
      if (expected.alpha !== undefined && current.alpha !== expected.alpha) issues.push('alpha mismatch');
      if (expected.estimatedQuality !== undefined && current.estimatedQuality < expected.estimatedQuality) issues.push('quality below expected');
      return { operationId: operation.id, expected, current, passed: !issues.length, issues };
    }));
  }
}
