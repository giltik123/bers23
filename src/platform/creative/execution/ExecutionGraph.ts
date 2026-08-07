import { deepFreeze, sameScope } from './immutable';
import type {
  ExecutionBarrier, ExecutionDependencies, ExecutionEdge, ExecutionGraphSnapshot,
  ExecutionNode, ExecutionScope, ExecutionStage,
} from './types';

export class ExecutionGraph {
  private readonly nodeStore = new Map<string, ExecutionNode>();
  private readonly edgeStore: ExecutionEdge[] = [];
  private readonly barrierStore: ExecutionBarrier[] = [];

  constructor(private readonly dependencies: ExecutionDependencies) {}

  addNode(node: ExecutionNode): ExecutionNode {
    if (this.nodeStore.has(node.id)) throw new Error(`Duplicate execution node: ${node.id}`);
    const value = deepFreeze({
      ...node,
      scope: { ...node.scope },
      dependencies: [...new Set(node.dependencies)].sort(),
      tags: [...new Set(node.tags)].sort(),
    }) as ExecutionNode;
    this.nodeStore.set(value.id, value);
    return value;
  }

  addEdge(edge: ExecutionEdge, scope: ExecutionScope): ExecutionEdge {
    const source = this.nodeStore.get(edge.source);
    const target = this.nodeStore.get(edge.target);
    if (!source || !target) throw new Error('Broken execution edge');
    if (!sameScope(source.scope, scope) || !sameScope(target.scope, scope)) throw new Error('Scope isolation violation');
    if (edge.source === edge.target || this.hasPath(edge.target, edge.source, scope)) throw new Error('Execution graph must remain acyclic');
    const value = deepFreeze({ ...edge }) as ExecutionEdge;
    this.edgeStore.push(value);
    return value;
  }

  addBarrier(barrier: ExecutionBarrier, scope: ExecutionScope): ExecutionBarrier {
    const ids = [...barrier.afterNodeIds, ...barrier.beforeNodeIds];
    if (ids.some((id) => !this.nodeStore.has(id) || !sameScope(this.nodeStore.get(id)!.scope, scope))) throw new Error('Invalid barrier reference');
    const value = deepFreeze({ ...barrier, afterNodeIds: [...barrier.afterNodeIds].sort(), beforeNodeIds: [...barrier.beforeNodeIds].sort() }) as ExecutionBarrier;
    this.barrierStore.push(value);
    return value;
  }

  nodes(scope: ExecutionScope): readonly ExecutionNode[] {
    return deepFreeze([...this.nodeStore.values()].filter((node) => sameScope(node.scope, scope)).sort((a, b) => a.id.localeCompare(b.id)));
  }

  edges(scope: ExecutionScope): readonly ExecutionEdge[] {
    const ids = new Set(this.nodes(scope).map((node) => node.id));
    return deepFreeze(this.edgeStore.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).slice().sort((a, b) => `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`)));
  }

  barriers(scope: ExecutionScope): readonly ExecutionBarrier[] {
    const ids = new Set(this.nodes(scope).map((node) => node.id));
    return deepFreeze(this.barrierStore.filter((barrier) => [...barrier.afterNodeIds, ...barrier.beforeNodeIds].every((id) => ids.has(id))).slice().sort((a, b) => a.id.localeCompare(b.id)));
  }

  topologicalOrder(scope: ExecutionScope): readonly string[] {
    const nodes = this.nodes(scope);
    const edges = this.edges(scope);
    const indegree = new Map(nodes.map((node) => [node.id, 0]));
    for (const edge of edges) indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort();
    const result: string[] = [];
    while (ready.length) {
      const id = ready.shift()!;
      result.push(id);
      for (const edge of edges.filter((item) => item.source === id)) {
        indegree.set(edge.target, indegree.get(edge.target)! - 1);
        if (indegree.get(edge.target) === 0) ready.push(edge.target);
      }
      ready.sort();
    }
    if (result.length !== nodes.length) throw new Error('Execution graph contains a cycle');
    return deepFreeze(result);
  }

  parallelGroups(scope: ExecutionScope): readonly (readonly string[])[] {
    const remaining = new Set(this.nodes(scope).map((node) => node.id));
    const complete = new Set<string>();
    const groups: string[][] = [];
    while (remaining.size) {
      const group = [...remaining].filter((id) => this.edges(scope).filter((edge) => edge.target === id).every((edge) => complete.has(edge.source))).sort();
      if (!group.length) throw new Error('Execution graph contains a cycle');
      groups.push(group);
      group.forEach((id) => { remaining.delete(id); complete.add(id); });
    }
    return deepFreeze(groups);
  }

  snapshot(scope: ExecutionScope, planId: string, stages: readonly ExecutionStage[] = []): ExecutionGraphSnapshot {
    return deepFreeze({
      id: this.dependencies.id(), scope: { ...scope }, planId, nodes: this.nodes(scope), edges: this.edges(scope),
      stages: [...stages], barriers: this.barriers(scope), topologicalOrder: this.topologicalOrder(scope), createdAt: this.dependencies.now(),
    });
  }

  private hasPath(from: string, to: string, scope: ExecutionScope): boolean {
    const queue = [from];
    const seen = new Set<string>();
    while (queue.length) {
      const current = queue.shift()!;
      if (current === to) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...this.edgeStore.filter((edge) => edge.source === current && sameScope(this.nodeStore.get(edge.target)!.scope, scope)).map((edge) => edge.target));
    }
    return false;
  }
}
