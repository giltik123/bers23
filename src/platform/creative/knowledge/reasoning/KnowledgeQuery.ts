import type { CreativeKnowledgeSystem } from '../CreativeKnowledgeSystem';
import { deepFreeze, normalize } from '../immutable';
import type { KnowledgeScope } from '../types';
import type { EvidenceSet, KnowledgeInference, KnowledgeQueryResult } from './types';

export class KnowledgeQuery {
  constructor(private readonly knowledge: CreativeKnowledgeSystem) {}

  findKnowledge(scope: KnowledgeScope, predicate: (concept: string) => boolean = () => true) {
    return deepFreeze(this.knowledge.graph().nodes(scope).filter((node) => predicate(node.concept)));
  }

  findConcept(concept: string, scope: KnowledgeScope) {
    return this.knowledge.graph().findConcept(concept, scope);
  }

  findRules(value?: string) {
    const rules = this.knowledge.rules().rules();
    if (!value) return rules;
    const term = normalize(value);
    return deepFreeze(rules.filter((rule) => normalize(JSON.stringify(rule)).includes(term)));
  }

  findEvidence(evidence: EvidenceSet, kind?: EvidenceSet['items'][number]['kind']) {
    return deepFreeze(evidence.items.filter((item) => !kind || item.kind === kind));
  }

  findReasoning(inference: KnowledgeInference, relation?: string) {
    return deepFreeze(inference.inferenceTree.filter((step) => !relation || step.relation === relation));
  }

  findRecommendations(inference: KnowledgeInference, minimumConfidence = 0) {
    return deepFreeze(inference.conclusions.filter((item) => item.confidence >= minimumConfidence).map((item) => item.concept));
  }

  result(scope: KnowledgeScope, inference?: KnowledgeInference): KnowledgeQueryResult {
    return deepFreeze({
      nodes: this.knowledge.graph().nodes(scope),
      edges: this.knowledge.graph().edges(scope),
      rules: this.knowledge.rules().rules(),
      evidence: inference?.evidence.items ?? [],
      reasoning: inference?.inferenceTree ?? [],
      recommendations: inference?.conclusions.map((item) => item.concept) ?? [],
    });
  }
}
