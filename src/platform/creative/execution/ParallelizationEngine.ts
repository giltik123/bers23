import { deepFreeze } from './immutable';
import type { ExecutionGraphSnapshot } from './types';

export class ParallelizationEngine {
  find(graph: ExecutionGraphSnapshot): readonly (readonly string[])[] {
    const incoming = new Map(graph.nodes.map((node) => [node.id, new Set(graph.edges.filter((edge) => edge.target === node.id).map((edge) => edge.source))]));
    const remaining = new Set(graph.nodes.map((node) => node.id));
    const complete = new Set<string>();
    const groups: string[][] = [];
    while (remaining.size) {
      const group = [...remaining].filter((id) => [...incoming.get(id)!].every((dependency) => complete.has(dependency))).sort();
      if (!group.length) throw new Error('Cannot parallelize cyclic graph');
      groups.push(group);
      group.forEach((id) => { remaining.delete(id); complete.add(id); });
    }
    return deepFreeze(groups);
  }
}
