import type { CreativeKnowledgeSystem } from '../CreativeKnowledgeSystem';
import { deepFreeze, normalize } from '../immutable';
import type { KnowledgeDependencies } from '../types';
import type { KnowledgeInferenceEngine } from './KnowledgeInferenceEngine';
import type { ReasoningPlan, ReasoningRequest } from './types';

export class KnowledgePlanner {
  constructor(
    private readonly knowledge: CreativeKnowledgeSystem,
    private readonly inference: KnowledgeInferenceEngine,
    private readonly dependencies: KnowledgeDependencies,
  ) {}

  plan(request: ReasoningRequest): ReasoningPlan {
    const backward = this.inference.backward(request);
    const forward = this.inference.forward(request);
    const recommendations = forward.conclusions.map((item) => item.concept);
    const neededKnowledge = backward.neededFacts.length > 0
      ? backward.neededFacts
      : this.knowledge.ontology().ancestors(request.goal).filter((item) => !request.facts.some((value) => normalize(typeof value === 'string' ? value : value.concept) === normalize(item)));
    const values = [
      { type: 'goal', value: request.goal },
      ...neededKnowledge.map((value) => ({ type: 'needed-knowledge', value })),
      ...forward.activatedRules.map((value) => ({ type: 'activated-rule', value: value.ruleId })),
      ...forward.conclusions.map((value) => ({ type: 'inference', value: value.concept })),
      ...recommendations.map((value) => ({ type: 'recommendation', value })),
    ];
    return deepFreeze({
      id: this.dependencies.id(),
      scope: { ...request.scope },
      goal: request.goal,
      neededKnowledge,
      activatedRules: forward.activatedRules.map((item) => item.ruleId),
      inference: forward.conclusions.map((item) => item.concept),
      recommendations,
      steps: values.map((item, index) => ({ order: index + 1, ...item })),
      createdAt: this.dependencies.now(),
    });
  }
}
