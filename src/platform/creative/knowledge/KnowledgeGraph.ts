import { clamp, deepFreeze, normalize, sameScope } from './immutable';
import type { KnowledgeDependencies, KnowledgeEdge, KnowledgeNode, KnowledgeScope } from './types';

export class KnowledgeGraph {
  private readonly nodeStore = new Map<string, KnowledgeNode>();
  private readonly edgeStore: KnowledgeEdge[] = [];
  constructor(private readonly dependencies: KnowledgeDependencies) {
    if (!dependencies?.id || !dependencies?.now) throw new Error('KnowledgeGraph requires injected id and now dependencies');
  }
  addNode(input: Omit<KnowledgeNode, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<KnowledgeNode, 'id' | 'createdAt' | 'updatedAt'>>): KnowledgeNode {
    const now = input.createdAt ?? this.dependencies.now();
    const node = deepFreeze({ ...input, id: input.id ?? this.dependencies.id(), scope: { ...input.scope }, tags: [...input.tags].sort(), confidence: clamp(input.confidence), importance: clamp(input.importance), support: Math.max(0, input.support), evidenceCount: Math.max(0, Math.floor(input.evidenceCount)), createdAt: now, updatedAt: input.updatedAt ?? now, generation: input.generation ?? 1, children: [...(input.children ?? [])], history: [...(input.history ?? [])], mergedFrom: [...(input.mergedFrom ?? [])], deprecated: input.deprecated ?? false, active: input.active ?? true }) as KnowledgeNode;
    if (this.nodeStore.has(node.id)) throw new Error(`Duplicate node id: ${node.id}`);
    this.nodeStore.set(node.id, node);
    return node;
  }
  addEdge(input: KnowledgeEdge, scope?: KnowledgeScope): KnowledgeEdge {
    const source = this.nodeStore.get(input.source), target = this.nodeStore.get(input.target);
    if (!source || !target) throw new Error('Broken edge reference');
    if (!sameScope(source, target.scope) || (scope && !sameScope(source, scope))) throw new Error('Scope isolation violation');
    const edge = deepFreeze({ ...input, weight: Math.max(0, input.weight), confidence: clamp(input.confidence), support: Math.max(0, input.support) }) as KnowledgeEdge;
    this.edgeStore.push(edge); return edge;
  }
  nodes(scope?: KnowledgeScope): readonly KnowledgeNode[] { return deepFreeze([...this.nodeStore.values()].filter(n => !scope || sameScope(n, scope)).sort((a,b) => a.id.localeCompare(b.id))); }
  edges(scope?: KnowledgeScope): readonly KnowledgeEdge[] { return deepFreeze(this.edgeStore.filter(e => !scope || (this.nodeStore.get(e.source) && sameScope(this.nodeStore.get(e.source)!, scope))).slice().sort((a,b) => `${a.source}:${a.target}:${a.relation}`.localeCompare(`${b.source}:${b.target}:${b.relation}`))); }
  neighbors(id: string, scope?: KnowledgeScope, relation?: string): readonly KnowledgeNode[] {
    const origin = this.nodeStore.get(id); if (!origin || (scope && !sameScope(origin, scope))) return deepFreeze([]);
    const ids = this.edgeStore.filter(e => (!relation || e.relation === relation) && (e.source === id || e.target === id)).map(e => e.source === id ? e.target : e.source);
    return deepFreeze([...new Set(ids)].map(x => this.nodeStore.get(x)!).filter(Boolean).sort((a,b)=>a.id.localeCompare(b.id)));
  }
  subgraph(ids: readonly string[], scope?: KnowledgeScope): { nodes: readonly KnowledgeNode[]; edges: readonly KnowledgeEdge[] } {
    const allowed = new Set(ids); return deepFreeze({ nodes: this.nodes(scope).filter(n => allowed.has(n.id)), edges: this.edges(scope).filter(e => allowed.has(e.source) && allowed.has(e.target)) });
  }
  shortestPath(source: string, target: string, scope?: KnowledgeScope): readonly KnowledgeNode[] {
    if (source === target) { const n=this.nodeStore.get(source); return deepFreeze(n && (!scope || sameScope(n,scope)) ? [n] : []); }
    const queue: string[][]=[[source]], visited=new Set([source]);
    while(queue.length){ const path=queue.shift()!; for(const n of this.neighbors(path[path.length-1],scope)){ if(visited.has(n.id)) continue; const next=[...path,n.id]; if(n.id===target) return deepFreeze(next.map(id=>this.nodeStore.get(id)!)); visited.add(n.id); queue.push(next); } }
    return deepFreeze([]);
  }
  relatedConcepts(id: string, limit=10, scope?: KnowledgeScope): readonly KnowledgeNode[] { return deepFreeze(this.neighbors(id,scope).slice().sort((a,b)=>this.importance(b.id)-this.importance(a.id)||a.id.localeCompare(b.id)).slice(0,limit)); }
  importance(id: string): number { const n=this.nodeStore.get(id); if(!n) return 0; const incident=this.edgeStore.filter(e=>e.source===id||e.target===id); const edge=incident.length ? incident.reduce((s,e)=>s+e.weight*e.confidence,0)/incident.length : 0; return clamp(n.importance*.5+clamp(n.support/(n.support+5))*.2+clamp(edge)*.2+clamp(incident.length/10)*.1); }
  centralConcepts(limit=10, scope?: KnowledgeScope): readonly KnowledgeNode[] { return deepFreeze(this.nodes(scope).slice().sort((a,b)=>this.importance(b.id)-this.importance(a.id)||a.id.localeCompare(b.id)).slice(0,limit)); }
  connectedComponents(scope?: KnowledgeScope): readonly (readonly KnowledgeNode[])[] { const remaining=new Set(this.nodes(scope).map(n=>n.id)), result: KnowledgeNode[][]=[]; while(remaining.size){ const first=[...remaining].sort()[0], stack=[first], component: KnowledgeNode[]=[]; remaining.delete(first); while(stack.length){const id=stack.pop()!, node=this.nodeStore.get(id)!; component.push(node); for(const n of this.neighbors(id,scope)) if(remaining.delete(n.id)) stack.push(n.id);} result.push(component.sort((a,b)=>a.id.localeCompare(b.id)));} return deepFreeze(result.sort((a,b)=>a[0].id.localeCompare(b[0].id))); }
  findConcept(concept: string, scope?: KnowledgeScope): KnowledgeNode | undefined { return this.nodes(scope).find(n=>normalize(n.concept)===normalize(concept)); }
  snapshot(scope?: KnowledgeScope){ return deepFreeze({nodes:this.nodes(scope),edges:this.edges(scope)}); }
}
