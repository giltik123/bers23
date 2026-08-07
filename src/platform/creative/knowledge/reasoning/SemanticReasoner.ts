import type { CreativeKnowledgeSystem } from '../CreativeKnowledgeSystem';
import { clamp, deepFreeze } from '../immutable';
import type { KnowledgeScope, SearchResult } from '../types';
import type { SemanticBridge } from './types';

export class SemanticReasoner {
  constructor(private readonly knowledge: CreativeKnowledgeSystem) {}

  relatedConcepts(concept: string, scope: KnowledgeScope, limit = 10) {
    const node = this.knowledge.graph().findConcept(concept, scope);
    return deepFreeze(node ? this.knowledge.graph().relatedConcepts(node.id, limit, scope) : []);
  }

  implicitKnowledge(concept: string, scope: KnowledgeScope) {
    const results = this.knowledge.search({ concept, scope, limit: 20 }) as readonly SearchResult[];
    return deepFreeze(results.filter((item) => item.path.length > 2));
  }

  hiddenRelations(concept: string, scope: KnowledgeScope) {
    return deepFreeze(this.implicitKnowledge(concept, scope).map((result) => ({
      from: concept,
      to: result.node.concept,
      path: result.path,
      confidence: clamp(result.score * result.node.confidence),
    })));
  }

  nearestConcepts(concept: string, scope: KnowledgeScope, limit = 10) {
    return this.knowledge.search({ concept, scope, limit }) as readonly SearchResult[];
  }

  semanticBridges(from: string, to: string, scope: KnowledgeScope): readonly SemanticBridge[] {
    const source = this.knowledge.graph().findConcept(from, scope);
    const target = this.knowledge.graph().findConcept(to, scope);
    if (!source || !target) return deepFreeze([]);
    const path = this.knowledge.graph().shortestPath(source.id, target.id, scope);
    if (path.length < 3) return deepFreeze([]);
    return deepFreeze(path.slice(1, -1).map((node, index) => ({
      from: index === 0 ? from : path[index].concept,
      via: node.concept,
      to: index === path.length - 3 ? to : path[index + 2].concept,
      confidence: clamp(node.confidence / path.length * 2),
    })));
  }
}
