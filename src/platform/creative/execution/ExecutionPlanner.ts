import type { CreativePlan } from '../planning';
import { clamp, deepFreeze } from './immutable';
import { ExecutionGraph } from './ExecutionGraph';
import { ParallelizationEngine } from './ParallelizationEngine';
import type { ExecutionDependencies, ExecutionGraphSnapshot, ExecutionNode, ExecutionStage } from './types';

export class ExecutionPlanner {
  private readonly parallel = new ParallelizationEngine();
  constructor(private readonly dependencies: ExecutionDependencies) {}

  build(plan: CreativePlan): ExecutionGraphSnapshot {
    const graph = new ExecutionGraph(this.dependencies);
    const operations = plan.graph.nodes.filter((node) => node.type === 'operation');
    const byPlanNode = new Map<string, ExecutionNode>();
    for (const operation of operations) {
      const mode = operation.ai ? 'ai' as const : 'local' as const;
      const node = graph.addNode({
        id: this.dependencies.id(), scope: { ...plan.scope }, planNodeId: operation.id,
        operation: operation.operation ?? operation.title, mode, status: 'pending', dependencies: [],
        rollbackPoint: true, verificationRequired: true, credits: operation.cost,
        latency: operation.latency, gpuTime: operation.ai ? operation.latency * 0.7 : 0,
        cpuTime: operation.local ? operation.latency : operation.latency * 0.3,
        memory: Math.max(1, operation.latency * 2), aiCalls: operation.ai ? 1 : 0,
        expectedRetries: clamp(operation.risk), quality: operation.quality, risk: operation.risk, tags: operation.tags,
      });
      byPlanNode.set(operation.id, node);
    }
    const operationIds = new Set(operations.map((node) => node.id));
    for (const target of operations) {
      const predecessors = this.resolveOperationPredecessors(target.id, plan, operationIds);
      for (const sourceId of predecessors) {
        graph.addEdge({ source: byPlanNode.get(sourceId)!.id, target: byPlanNode.get(target.id)!.id, relation: 'depends-on' }, plan.scope);
      }
    }
    const preliminary = graph.snapshot(plan.scope, plan.id);
    const groups = this.parallel.find(preliminary);
    const stages: ExecutionStage[] = groups.map((nodeIds, index) => ({
      id: this.dependencies.id(), order: index + 1, name: `Stage ${index + 1}`,
      groups: [{ id: this.dependencies.id(), nodeIds, parallel: nodeIds.length > 1 }], barriers: [],
    }));
    for (let index = 0; index < stages.length - 1; index += 1) {
      const barrier = graph.addBarrier({ id: this.dependencies.id(), afterNodeIds: stages[index].groups[0].nodeIds, beforeNodeIds: stages[index + 1].groups[0].nodeIds, reason: 'Stage synchronization' }, plan.scope);
      stages[index] = { ...stages[index], barriers: [barrier] };
    }
    return graph.snapshot(plan.scope, plan.id, deepFreeze(stages));
  }

  private resolveOperationPredecessors(targetId: string, plan: CreativePlan, operations: ReadonlySet<string>): readonly string[] {
    const reverse = new Map<string, string[]>();
    for (const edge of plan.graph.edges) reverse.set(edge.target, [...(reverse.get(edge.target) ?? []), edge.source]);
    const queue = [...(reverse.get(targetId) ?? [])];
    const result = new Set<string>();
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (operations.has(id)) result.add(id);
      else queue.push(...(reverse.get(id) ?? []));
    }
    return [...result].sort();
  }
}
