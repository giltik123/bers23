import { clamp, deepFreeze } from '../immutable';
import type { KnowledgeConfidenceInput, KnowledgeConfidenceScore } from './types';

export class KnowledgeConfidence {
  calculate(input: KnowledgeConfidenceInput): KnowledgeConfidenceScore {
    const score = {
      ruleConfidence: clamp(input.ruleConfidence),
      graphConfidence: clamp(input.graphConfidence),
      ontologyConfidence: clamp(input.ontologyConfidence),
      evidenceConfidence: clamp(input.evidenceConfidence),
      support: clamp(input.support),
      conflicts: Math.max(0, input.conflicts),
      coverage: clamp(input.coverage),
    };
    const positive = score.ruleConfidence * 0.2
      + score.graphConfidence * 0.2
      + score.ontologyConfidence * 0.1
      + score.evidenceConfidence * 0.2
      + score.support * 0.1
      + score.coverage * 0.2;
    return deepFreeze({ ...score, value: clamp(positive * Math.max(0, 1 - score.conflicts * 0.12)) });
  }
}
