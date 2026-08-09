import { deepFreeze } from '../immutable';
import type { KnowledgeExplanation, KnowledgeInference } from './types';

export class KnowledgeExplainability {
  explain(inference: KnowledgeInference): KnowledgeExplanation {
    const knowledge = inference.knowledgePath;
    const rules = inference.activatedRules.map((item) => item.ruleId);
    const evidence = inference.evidence.items.map((item) => item.description);
    const reasoning = inference.inferenceTree.map((item) => item.therefore);
    const recommendations = inference.conclusions.map((item) => item.concept);
    const narrative = [
      `Goal: ${inference.goal}`,
      `Knowledge: ${knowledge.join(' → ') || 'none'}`,
      `Rules: ${rules.join(', ') || 'none'}`,
      `Evidence: ${evidence.join(', ') || 'none'}`,
      `Inference: ${reasoning.join(' → ') || 'none'}`,
      `Recommendation: ${recommendations.join(', ') || 'none'}`,
    ].join('\n');
    return deepFreeze({ goal: inference.goal, knowledge, rules, evidence, inference: reasoning, recommendations, narrative });
  }
}
