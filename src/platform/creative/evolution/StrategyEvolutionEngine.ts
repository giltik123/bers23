import { immutable } from './immutable';
import type { EvolutionDependencies, StrategyNode } from './types';
export class StrategyEvolutionEngine {
  private readonly nodes = new Map<string, StrategyNode>();
  constructor(private readonly dependencies: EvolutionDependencies) {}
  create(name: string, metrics: Pick<StrategyNode, 'performance' | 'support' | 'confidence' | 'roi'>, parentId?: string): StrategyNode { const parent = parentId ? this.require(parentId) : undefined; const node = immutable({ id: this.dependencies.nextId(), name, version: (parent?.version ?? 0) + 1, parentId, childIds: [], ...metrics, status: 'EXPERIMENTAL' as const }); this.nodes.set(node.id, node); if (parent) this.nodes.set(parent.id, immutable({ ...parent, childIds: [...parent.childIds, node.id] })); return node; }
  evaluate(id: string, minimumRoi = 0): StrategyNode { const node = this.require(id); const status = node.performance >= .6 && node.support >= .5 && node.roi >= minimumRoi ? 'ACTIVE' : 'REJECTED'; const updated = immutable({ ...node, status } as StrategyNode); this.nodes.set(id, updated); return updated; }
  tree(rootId: string): readonly StrategyNode[] { const visit = (id: string): StrategyNode[] => { const node = this.require(id); return [node, ...node.childIds.flatMap(visit)]; }; return immutable(visit(rootId)); }
  private require(id: string) { const value = this.nodes.get(id); if (!value) throw new Error(`Unknown strategy ${id}`); return value; }
}
