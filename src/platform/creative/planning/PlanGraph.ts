import { deepFreeze, sameScope } from './immutable';
import type { PlanEdge, PlanGraphSnapshot, PlanningScope, PlanNode } from './types';

export class PlanGraph {
  private readonly nodesById = new Map<string, PlanNode>();
  private readonly edgeList: PlanEdge[] = [];

  addNode(node: PlanNode): PlanNode {
    if (this.nodesById.has(node.id)) throw new Error(`Duplicate plan node: ${node.id}`);
    const frozen = deepFreeze({ ...node, scope: { ...node.scope }, dependencies: [...node.dependencies].sort(), tags: [...node.tags].sort() }) as PlanNode;
    this.nodesById.set(node.id, frozen);
    return frozen;
  }

  addEdge(edge: PlanEdge, scope: PlanningScope): PlanEdge {
    const source = this.nodesById.get(edge.source);
    const target = this.nodesById.get(edge.target);
    if (!source || !target) throw new Error('Broken plan edge');
    if (!sameScope(source.scope, scope) || !sameScope(target.scope, scope)) throw new Error('Scope isolation violation');
    if (this.hasPath(edge.target, edge.source, scope)) throw new Error('Plan graph must remain acyclic');
    const frozen = deepFreeze({ ...edge }) as PlanEdge;
    this.edgeList.push(frozen);
    return frozen;
  }

  nodes(scope: PlanningScope): readonly PlanNode[] {
    return deepFreeze([...this.nodesById.values()].filter((node) => sameScope(node.scope, scope)).sort((a, b) => a.id.localeCompare(b.id)));
  }

  edges(scope: PlanningScope): readonly PlanEdge[] {
    const ids = new Set(this.nodes(scope).map((node) => node.id));
    return deepFreeze(this.edgeList.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).slice().sort((a, b) => `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`)));
  }

  dependencies(nodeId: string, scope: PlanningScope): readonly PlanNode[] {
    return deepFreeze(this.edges(scope).filter((edge) => edge.target === nodeId).map((edge) => this.nodesById.get(edge.source)!).sort((a, b) => a.id.localeCompare(b.id)));
  }

  dependents(nodeId: string, scope: PlanningScope): readonly PlanNode[] {
    return deepFreeze(this.edges(scope).filter((edge) => edge.source === nodeId).map((edge) => this.nodesById.get(edge.target)!).sort((a, b) => a.id.localeCompare(b.id)));
  }

  topologicalOrder(scope: PlanningScope): readonly string[] {
    const nodes = this.nodes(scope);
    const edges = this.edges(scope);
    const indegree = new Map(nodes.map((node) => [node.id, 0]));
    for (const edge of edges) indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort();
    const result: string[] = [];
    while (ready.length > 0) {
      const id = ready.shift()!;
      result.push(id);
      for (const edge of edges.filter((candidate) => candidate.source === id)) {
        indegree.set(edge.target, indegree.get(edge.target)! - 1);
        if (indegree.get(edge.target) === 0) ready.push(edge.target);
      }
      ready.sort();
    }
    if (result.length !== nodes.length) throw new Error('Plan graph contains a cycle');
    return deepFreeze(result);
  }

  parallelGroups(scope: PlanningScope): readonly (readonly string[])[] {
    const remaining = new Set(this.nodes(scope).map((node) => node.id));
    const completed = new Set<string>();
    const groups: string[][] = [];
    while (remaining.size > 0) {
      const group = [...remaining].filter((id) => this.dependencies(id, scope).every((node) => completed.has(node.id))).sort();
      if (group.length === 0) throw new Error('Plan graph contains a cycle');
      groups.push(group);
      group.forEach((id) => { remaining.delete(id); completed.add(id); });
    }
    return deepFreeze(groups);
  }

  snapshot(scope: PlanningScope): PlanGraphSnapshot {
    return deepFreeze({ nodes: this.nodes(scope), edges: this.edges(scope), topologicalOrder: this.topologicalOrder(scope), parallelGroups: this.parallelGroups(scope) });
  }

  private hasPath(source: string, target: string, scope: PlanningScope): boolean {
    const queue = [source];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === target) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      queue.push(...this.edgeList.filter((edge) => edge.source === current && sameScope(this.nodesById.get(edge.target)!.scope, scope)).map((edge) => edge.target));
    }
    return false;
  }
}
