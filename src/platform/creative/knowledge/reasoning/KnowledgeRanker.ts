import { clamp, deepFreeze } from '../immutable';
import type { KnowledgeNode } from '../types';
import type { RankedKnowledge } from './types';

export interface KnowledgeRankingContext {
  readonly usage?: Readonly<Record<string, number>>;
  readonly utility?: Readonly<Record<string, number>>;
}

export class KnowledgeRanker {
  rank(nodes: readonly KnowledgeNode[], context: KnowledgeRankingContext = {}): readonly RankedKnowledge[] {
    return deepFreeze(nodes.map((node) => {
      const signals = {
        importance: clamp(node.importance),
        confidence: clamp(node.confidence),
        support: clamp(node.support / (node.support + 5)),
        specificity: clamp((node.tags.length + (node.category ? 1 : 0)) / 6),
        novelty: clamp(1 / (node.generation ?? 1)),
        utility: clamp(context.utility?.[node.id] ?? context.usage?.[node.id] ?? 0.5),
      };
      const score = signals.importance * 0.22 + signals.confidence * 0.2
        + signals.support * 0.16 + signals.specificity * 0.12
        + signals.novelty * 0.1 + signals.utility * 0.2;
      return { node, signals, score: clamp(score) };
    }).sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id)));
  }
}
