import { deepFreeze } from './immutable';
import type { PlanGraphSnapshot, PlanningDependencies, VerificationStep } from './types';

export class VerificationPlanner {
  constructor(private readonly dependencies: PlanningDependencies) {}

  plan(graph: PlanGraphSnapshot): readonly VerificationStep[] {
    return deepFreeze(graph.nodes.filter((node) => node.type === 'operation' || node.type === 'completion').map((node) => ({
      id: this.dependencies.id(),
      planNodeId: node.id,
      check: node.type === 'completion' ? 'goal completion' : `${node.title} output quality`,
      method: node.ai ? 'confidence and artifact inspection' : 'deterministic constraint check',
      when: node.type === 'completion' ? 'completion' as const : 'after' as const,
      required: true,
    })));
  }
}
