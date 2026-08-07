import { clamp, deepImmutable, rounded } from './immutable';
import type { CognitiveMode, CoverageResult, GovernanceModel, HallucinationFinding, HallucinationModel, IntelligenceObservation, KnowledgeCoverageModel, MetaInput, MetaLearningModel, MetaReasoningModel, MetaResult, Reflection, ReflectionModel, ResourceShare, StabilityModel, StabilityResult, ThinkingBudget, ThinkingPolicyModel, QualityMetrics } from './types';

export class HeuristicMetaReasoningModel implements MetaReasoningModel {
  chooseTrust(observations: readonly IntelligenceObservation[], coverage: CoverageResult) {
    if (!observations.length || coverage.state === 'IMPOSSIBLE') return 'NONE' as const;
    return [...observations].sort((a, b) => (b.confidence * (1 + Math.min(3, b.reasons.length) * .05)) - (a.confidence * (1 + Math.min(3, a.reasons.length) * .05)) || a.source.localeCompare(b.source))[0].source;
  }
}
export class HeuristicThinkingPolicyModel implements ThinkingPolicyModel {
  allocate(input: Pick<MetaInput, 'budget' | 'risk' | 'difficulty' | 'goals'>, confidence: number): ThinkingBudget {
    const need = clamp((input.difficulty ?? .5) * .45 + (input.risk ?? .3) * .35 + (1 - confidence) * .2);
    const capacity = clamp(input.budget / 100); const scale = Math.min(need, .2 + capacity);
    return deepImmutable({ depth: 1 + Math.round(scale * 9), iterations: 1 + Math.round(scale * 19), debateRounds: 1 + Math.round(scale * 5), simulations: Math.round(scale * 8), planningDepth: 1 + Math.round(scale * 7), shouldContinue: confidence < .82 && capacity > .05 });
  }
}
export class HeuristicHallucinationModel implements HallucinationModel {
  detect(input: MetaInput): readonly HallucinationFinding[] {
    const findings: HallucinationFinding[] = []; const known = new Set(input.knownDependencies ?? []);
    for (const item of input.observations) {
      if (!item.reasons.length) findings.push({ code: 'UNSUPPORTED_CONCLUSION', severity: .7, source: item.source });
      if ((item.operations?.length ?? 0) > Math.max(3, input.goals.length * 3)) findings.push({ code: 'EXTRA_OPERATION', severity: .5, source: item.source });
      if (item.dependencies?.some((dependency) => !known.has(dependency))) findings.push({ code: 'UNKNOWN_DEPENDENCY', severity: .8, source: item.source });
      if (item.confidence > .9 && item.reasons.length < 2) findings.push({ code: 'OVERCONFIDENCE', severity: .8, source: item.source });
      if (item.reasons.some((reason) => /assume|probably|очевидно|наверно/i.test(reason))) findings.push({ code: 'BOLD_ASSUMPTION', severity: .4, source: item.source });
    }
    return deepImmutable(findings);
  }
}
export class HeuristicGovernanceModel implements GovernanceModel {
  select(input: MetaInput, coverage: CoverageResult): CognitiveMode {
    if (input.requestedMode) return input.requestedMode;
    if (input.budget <= 5) return 'MINIMUM_COST'; if ((input.risk ?? 0) >= .85) return 'SCIENTIFIC';
    if (coverage.state === 'UNKNOWN') return 'RESEARCH'; if ((input.difficulty ?? .5) >= .9) return 'MAXIMUM_QUALITY';
    if ((input.difficulty ?? .5) <= .15) return 'FAST'; return 'BALANCED';
  }
}
export class HeuristicKnowledgeCoverageModel implements KnowledgeCoverageModel {
  analyze(domain: string | undefined, prompt: string): CoverageResult {
    const text = `${domain ?? ''} ${prompt}`.toLowerCase(); let score = .55; const matched: string[] = [];
    if (/luxury|fashion|brand|photo|portrait|lighting|creative|мод|бренд|фото/.test(text)) { score = .98; matched.push('creative'); }
    if (/medical|radiology|pathology|медицин|рентген/.test(text)) { score = .15; matched.push('medical'); }
    if (/impossible|невозмож/.test(text)) score = 0;
    const state = score === 0 ? 'IMPOSSIBLE' : score < .25 ? 'UNKNOWN' : score < .7 ? 'PARTIALLY_KNOWN' : 'KNOWN';
    return deepImmutable({ score, state, matchedDomains: matched });
  }
}
export class HeuristicStabilityModel implements StabilityModel {
  analyze(input: MetaInput): StabilityResult {
    if (!input.observations.length) return deepImmutable({ score: 0, stable: false, variants: 4 });
    const sorted = [...input.observations].sort((a, b) => b.confidence - a.confidence); const margin = sorted[0].confidence - (sorted[1]?.confidence ?? 0);
    const sensitivity = Object.values(input.preferences ?? {}).reduce((sum, value) => sum + Math.abs(value) * .05, 0);
    // Four deterministic ±5% counterfactual families: budget, preference,
    // lighting signal and goal pressure. A narrow winning margin is fragile.
    const perturbation = .05 * (1 + Math.min(1, sensitivity) + (input.goals.length ? .25 : 0));
    const score = rounded(.5 + margin - perturbation - sensitivity - (input.risk ?? 0) * .1);
    return deepImmutable({ score, stable: score >= .65, variants: 4 });
  }
}
export class HeuristicReflectionModel implements ReflectionModel {
  reflect(input: MetaInput, metrics: QualityMetrics, allocation: readonly ResourceShare[]): Reflection {
    const low = allocation.filter((item) => item.share < .08).map((item) => item.resource);
    return deepImmutable({ correct: metrics.reasoning >= .7 ? ['Evidence-backed reasoning'] : [], unnecessary: low.map((item) => `Low-impact resource: ${item}`), faster: metrics.planning < .7 ? ['Reduce planning branches'] : ['Stop at stable consensus'], unhelpfulExperts: low, nextTime: [input.observations.length > 2 ? 'Prioritize the strongest evidence first' : 'Collect one additional independent signal'] });
  }
}
export class HeuristicMetaLearningModel implements MetaLearningModel { key(result: Pick<MetaResult, 'mode' | 'trustedSource' | 'finalStrategy'>): string { return `${result.mode}:${result.trustedSource}:${result.finalStrategy}`; } }
