import type { ExecutionGraphSnapshot, ExecutionNode } from '../execution';
import { deepFreeze } from './immutable';
import type { IntegrationDependencies, ReplanningResult } from './types';

export class ReplanningBridge {
  constructor(private readonly dependencies: IntegrationDependencies) {}

  replan(graph: ExecutionGraphSnapshot, failedNodeIds: readonly string[], reason: string): ReplanningResult {
    const failed = new Set(failedNodeIds);
    const replacements = new Map<string, ExecutionNode>();
    const nodes = graph.nodes.map((node) => {
      if (!failed.has(node.id)) return node;
      const replacement = deepFreeze({ ...node, id: this.dependencies.id(), operation: `fallback ${node.operation}`, mode: node.mode === 'ai' ? 'local' as const : 'hybrid' as const, status: 'pending' as const, risk: Math.max(0, node.risk - 0.1), tags: [...node.tags, 'replanned'] }) as ExecutionNode;
      replacements.set(node.id, replacement);
      return replacement;
    });
    const replace = (id: string) => replacements.get(id)?.id ?? id;
    const resultGraph = deepFreeze({
      ...graph, id: this.dependencies.id(), nodes,
      edges: graph.edges.map((edge) => ({ ...edge, source: replace(edge.source), target: replace(edge.target) })),
      stages: graph.stages.map((stage) => ({ ...stage, groups: stage.groups.map((group) => ({ ...group, nodeIds: group.nodeIds.map(replace) })), barriers: stage.barriers.map((barrier) => ({ ...barrier, afterNodeIds: barrier.afterNodeIds.map(replace), beforeNodeIds: barrier.beforeNodeIds.map(replace) })) })),
      barriers: graph.barriers.map((barrier) => ({ ...barrier, afterNodeIds: barrier.afterNodeIds.map(replace), beforeNodeIds: barrier.beforeNodeIds.map(replace) })),
      topologicalOrder: graph.topologicalOrder.map(replace), createdAt: this.dependencies.now(),
    }) as ExecutionGraphSnapshot;
    return deepFreeze({ graph: resultGraph, replacedNodeIds: [...failed].sort(), preservedNodeIds: graph.nodes.filter((node) => !failed.has(node.id)).map((node) => node.id).sort(), reason });
  }
}
