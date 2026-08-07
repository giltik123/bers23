import { clamp, deepFreeze } from '../immutable';
import type { KnowledgeInference, KnowledgeSimulationResult } from './types';

export interface KnowledgeSimulationInput {
  readonly inference: KnowledgeInference;
  readonly operationCosts?: Readonly<Record<string, number>>;
  readonly riskSignals?: readonly number[];
}

export class KnowledgeSimulation {
  simulate(input: KnowledgeSimulationInput): KnowledgeSimulationResult {
    const recommendations = input.inference.conclusions;
    const costs = recommendations.map((item) => input.operationCosts?.[item.concept] ?? 0);
    const expectedCost = costs.reduce((sum, value) => sum + Math.max(0, value), 0);
    const risks = input.riskSignals ?? [];
    const expectedRisk = risks.length === 0 ? clamp(1 - input.inference.confidence.value) : clamp(risks.reduce((sum, value) => sum + clamp(value), 0) / risks.length);
    const sourceDiversity = new Set(recommendations.map((item) => item.source)).size;
    return deepFreeze({
      expectedQuality: clamp(input.inference.confidence.value * 0.7 + input.inference.evidence.confidence * 0.3),
      expectedCost,
      expectedRisk,
      expectedCreativity: clamp(recommendations.length / 8 * 0.7 + sourceDiversity / 4 * 0.3),
      confidence: input.inference.confidence.value,
    });
  }
}
