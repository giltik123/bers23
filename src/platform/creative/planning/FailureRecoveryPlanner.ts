import { deepFreeze } from './immutable';
import type { CreativePlan, FailureReport, PlanningDependencies } from './types';

export class FailureRecoveryPlanner {
  constructor(private readonly dependencies: PlanningDependencies) {}

  repair(plan: CreativePlan, failure: FailureReport): CreativePlan {
    if (failure.planId !== plan.id) throw new Error('Failure does not belong to plan');
    if (!plan.graph.nodes.some((node) => node.id === failure.nodeId)) throw new Error('Failed node does not exist');
    const nodes = plan.graph.nodes.map((node) => node.id !== failure.nodeId ? node : {
      ...node,
      id: this.dependencies.id(),
      title: `Recovery: ${node.title}`,
      status: 'planned' as const,
      quality: Math.min(1, node.quality + 0.05),
      risk: Math.max(0, node.risk - 0.05),
      tags: [...node.tags, 'recovery'],
    });
    const replacement = nodes.find((node) => node.title === `Recovery: ${plan.graph.nodes.find((item) => item.id === failure.nodeId)!.title}`)!;
    const edges = plan.graph.edges.map((edge) => ({ source: edge.source === failure.nodeId ? replacement.id : edge.source, target: edge.target === failure.nodeId ? replacement.id : edge.target, relation: edge.relation }));
    const topologicalOrder = plan.graph.topologicalOrder.map((id) => id === failure.nodeId ? replacement.id : id);
    const parallelGroups = plan.graph.parallelGroups.map((group) => group.map((id) => id === failure.nodeId ? replacement.id : id));
    return deepFreeze({ ...plan, id: this.dependencies.id(), name: `${plan.name} recovery`, graph: { nodes, edges, topologicalOrder, parallelGroups }, createdAt: this.dependencies.now(), generation: plan.generation + 1, parentPlanId: plan.id, ready: plan.resources.feasible });
  }
}
