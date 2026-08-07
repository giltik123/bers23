import type { CreativeKnowledgeSystem } from '../CreativeKnowledgeSystem';
import { clamp, deepFreeze, normalize } from '../immutable';
import type { KnowledgeScope } from '../types';
import type { CoverageResult } from './types';

export class KnowledgeCoverageAnalyzer {
  constructor(private readonly knowledge: CreativeKnowledgeSystem) {}

  analyze(concepts: readonly string[], scope: KnowledgeScope): CoverageResult {
    const nodes = this.knowledge.graph().nodes(scope);
    const known: string[] = [];
    const unknown: string[] = [];
    const weak: string[] = [];
    const conflicting: string[] = [];
    for (const concept of [...new Set(concepts)].sort()) {
      const node = nodes.find((candidate) => normalize(candidate.concept) === normalize(concept));
      if (!node) unknown.push(concept);
      else {
        known.push(concept);
        if (node.confidence < 0.6 || node.support < 2) weak.push(concept);
        if (this.knowledge.graph().edges(scope).some((edge) => edge.relation === 'contradicts' && (edge.source === node.id || edge.target === node.id))) conflicting.push(concept);
      }
    }
    const missing = unknown.slice();
    const value = concepts.length === 0 ? 1 : clamp((known.length - weak.length * 0.5 - conflicting.length * 0.5) / concepts.length);
    return deepFreeze({ known, unknown, missing, conflicting, weak, value });
  }
}
