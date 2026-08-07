import { clamp, deepImmutable, rounded } from './immutable';
import { HeuristicHallucinationModel, HeuristicKnowledgeCoverageModel, HeuristicStabilityModel, HeuristicThinkingPolicyModel } from './models';
import type { CognitiveTimelineEvent, CoverageResult, HallucinationModel, IntelligenceObservation, IntelligenceScore, KnowledgeCoverageModel, KnowledgeState, MetaConfidence, MetaInput, QualityMetrics, ResourceShare, StabilityModel, ThinkingPolicyModel } from './types';

export class ThinkingBudgetManager {
  constructor(private readonly model: ThinkingPolicyModel = new HeuristicThinkingPolicyModel()) {}
  allocate(input: Pick<MetaInput, 'budget' | 'risk' | 'difficulty' | 'goals'>, confidence: number) { return this.model.allocate(input, confidence); }
}
export class CognitiveComplexityEstimator {
  estimate(prompt: string, difficulty?: number): number { if (difficulty !== undefined) return rounded(difficulty); const text = prompt.toLowerCase(); if (/^\s*(brightness|яркость)\s*$/.test(text)) return .05; if (/luxury.*campaign|campaign.*luxury|люкс.*кампан/.test(text)) return .96; return rounded(.15 + Math.min(.65, text.split(/\s+/).filter(Boolean).length * .035) + (/strategy|research|стратег|исслед/.test(text) ? .2 : 0)); }
}
export class CognitiveResourceAllocator {
  allocate(prompt: string): readonly ResourceShare[] {
    const text = prompt.toLowerCase();
    if (/passport|паспорт/.test(text)) return deepImmutable([{ resource: 'QUALITY', share: .8 }, { resource: 'COMPOSITION', share: .2 }]);
    if (/luxury|fashion|campaign|люкс|мод|кампан/.test(text)) return deepImmutable([{ resource: 'DIRECTOR', share: .4 }, { resource: 'BRAND', share: .3 }, { resource: 'COMPOSITION', share: .2 }, { resource: 'COST', share: .1 }]);
    return deepImmutable([{ resource: 'DECISION', share: .5 }, { resource: 'QUALITY', share: .3 }, { resource: 'COST', share: .2 }]);
  }
}
export class SelfMonitoringEngine {
  evaluate(input: MetaInput): QualityMetrics {
    const count = input.observations.length; const evidence = count ? input.observations.reduce((sum, item) => sum + Math.min(1, item.reasons.length / 2), 0) / count : 0;
    const strategies = new Set(input.observations.map((item) => item.strategy)).size; const consensus = count ? 1 - (strategies - 1) / Math.max(1, count) : 0;
    return deepImmutable({ thinking: rounded((evidence + consensus) / 2), reasoning: rounded(evidence), planning: rounded(.5 + Math.min(.4, input.goals.length * .1)), conflict: rounded(consensus), consensus: rounded(consensus), prediction: rounded(input.observations.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, count)), learning: .5 });
  }
}
export class HallucinationDetector { constructor(private readonly model: HallucinationModel = new HeuristicHallucinationModel()) {} detect(input: MetaInput) { return this.model.detect(input); } }
export class DecisionStabilityAnalyzer { constructor(private readonly model: StabilityModel = new HeuristicStabilityModel()) {} analyze(input: MetaInput) { return this.model.analyze(input); } }
export class ExplainabilityValidator {
  validate(observations: readonly IntelligenceObservation[]): { explainable: boolean; penalty: number } { const explained = observations.filter((item) => item.reasons.some((reason) => reason.trim().length >= 5)).length; const ratio = explained / Math.max(1, observations.length); return deepImmutable({ explainable: ratio >= .75, penalty: rounded((1 - ratio) * .35) }); }
}
export class KnowledgeCoverageAnalyzer { constructor(private readonly model: KnowledgeCoverageModel = new HeuristicKnowledgeCoverageModel()) {} analyze(domain: string | undefined, prompt: string): CoverageResult { return this.model.analyze(domain, prompt); } }
export class UnknownDetector { detect(coverage: CoverageResult): KnowledgeState { return coverage.state; } }
export class MetaConfidenceEngine {
  calculate(observations: readonly IntelligenceObservation[], coverage: number, hallucinations: number, explainabilityPenalty: number): MetaConfidence {
    if (!observations.length) return deepImmutable({ value: 0, confidenceOfConfidence: 0, dispersion: 1, evidence: 0 });
    const mean = observations.reduce((sum, item) => sum + clamp(item.confidence), 0) / observations.length;
    const variance = observations.reduce((sum, item) => sum + (item.confidence - mean) ** 2, 0) / observations.length; const dispersion = Math.sqrt(variance);
    const evidence = observations.reduce((sum, item) => sum + Math.min(1, item.reasons.length / 2), 0) / observations.length;
    return deepImmutable({ value: rounded(mean - explainabilityPenalty), confidenceOfConfidence: rounded((1 - dispersion) * coverage * evidence * Math.max(.2, 1 - hallucinations * .12)), dispersion: rounded(dispersion), evidence: rounded(evidence) });
  }
}
export class CreativeIntelligenceHealthMonitor {
  evaluate(metrics: QualityMetrics, coverage: number, metaConfidence: number) { const dimensions = deepImmutable({ decision: metrics.prediction, director: metrics.reasoning, studio: metrics.consensus, learning: metrics.learning, reasoning: metrics.reasoning, planning: metrics.planning, knowledge: coverage, consensus: metrics.consensus, memory: .5, orchestrator: metrics.thinking, meta: metaConfidence }); const values = Object.values(dimensions); const overall = rounded(values.reduce((a, b) => a + b, 0) / values.length); return deepImmutable({ dimensions, overall, status: overall >= .7 ? 'HEALTHY' as const : overall >= .4 ? 'WATCH' as const : 'CRITICAL' as const }); }
}
export class CreativeIntelligenceScoreV3 {
  calculate(metrics: QualityMetrics, coverage: number, confidence: number, efficiency: number): IntelligenceScore { const dimensions = deepImmutable({ reasoning: metrics.reasoning, planning: metrics.planning, creativity: metrics.thinking, robustness: confidence, reliability: metrics.prediction, explainability: metrics.reasoning, learning: metrics.learning, adaptation: confidence, consistency: metrics.consensus, efficiency: clamp(efficiency), knowledge: coverage, governance: metrics.conflict }); const overall = rounded(Object.values(dimensions).reduce((a, b) => a + b, 0) / 12); return deepImmutable({ dimensions, overall, version: 3 }); }
}
export class CognitiveTimeline { build(id: string, at: number, details: Readonly<Record<string, string>>): readonly CognitiveTimelineEvent[] { const stages = ['Intent', 'Goals', 'Experts', 'Debate', 'Consensus', 'Director', 'Decision', 'Orchestrator', 'Meta Review', 'Learning', 'Reflection']; return deepImmutable(stages.map((stage, sequence) => ({ id: `${id}:timeline:${sequence}`, at, sequence, stage, detail: details[stage] ?? 'reviewed' }))); } }
