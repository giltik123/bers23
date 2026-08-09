import { deepFreeze } from './immutable';
import type { ExecutionDependencies, ExecutionGraphSnapshot, ExecutionVerificationStep } from './types';

export class VerificationEngine {
  constructor(private readonly dependencies: ExecutionDependencies) {}

  build(graph: ExecutionGraphSnapshot): readonly ExecutionVerificationStep[] {
    return deepFreeze(graph.stages.map((stage) => {
      const nodes = stage.groups.flatMap((group) => group.nodeIds.map((id) => graph.nodes.find((node) => node.id === id)!));
      const label = nodes.map((node) => node.operation).join(', ');
      return {
        id: this.dependencies.id(), stageId: stage.id, check: `${label} quality`,
        method: nodes.some((node) => node.mode === 'ai') ? 'artifact confidence inspection' : 'deterministic output constraints',
        threshold: Math.min(0.95, ...nodes.map((node) => node.quality)), required: true,
      };
    }));
  }
}
