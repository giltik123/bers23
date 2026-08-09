import { deepFreeze } from './immutable';
import type { PlanGraphSnapshot } from './types';

export class DependencyPlanner {
  analyze(graph: PlanGraphSnapshot) {
    const before = graph.edges.map((edge) => ({ before: edge.source, after: edge.target, reason: edge.relation }));
    const after = graph.nodes.map((node) => ({ nodeId: node.id, after: graph.edges.filter((edge) => edge.target === node.id).map((edge) => edge.source) }));
    return deepFreeze({ before, after, parallel: graph.parallelGroups });
  }
}
