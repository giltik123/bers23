import { clamp, immutable } from './immutable';
import type { BudgetAssessment, BudgetOptimizationModel, ConfidenceFusionModel, ConfidenceResult, ConflictResolution, ConflictResolutionModel, CreativeBudget, ExecutionGraph, ExecutionSchedulingModel, ExpertSelection, ExpertSelectionModel, GovernanceDecision, GovernanceModel, IntelligenceKind, IntelligenceSignal, OperatingMode, OrchestratorLearningModel, PolicyInput, ExecutivePolicyModel, Strategy } from './types';

export class HeuristicExecutivePolicyModel implements ExecutivePolicyModel {
  select({ mode, complexity, budget }: PolicyInput): readonly IntelligenceKind[] {
    const nodes: IntelligenceKind[] = ['DECISION'];
    if (mode !== 'FAST' || complexity >= 35) nodes.unshift('DIRECTOR');
    if (complexity >= 55 && budget.total - budget.spent > 0 || mode === 'STUDIO' || mode === 'RESEARCH') nodes.push('STUDIO');
    if (complexity >= 75 || mode === 'RESEARCH') nodes.push('SIMULATION');
    if (mode === 'QUALITY' || mode === 'STUDIO' || mode === 'AUTONOMOUS' || mode === 'RESEARCH') nodes.push('SELF_CRITIC');
    if (mode === 'AUTONOMOUS' || mode === 'RESEARCH') nodes.push('REPLAY');
    return immutable([...new Set(nodes), 'RESULT']);
  }
}

export class HeuristicExpertSelectionModel implements ExpertSelectionModel {
  select(prompt: string, domain?: string, complexity = 0): ExpertSelection {
    const text = `${prompt} ${domain ?? ''}`.toLowerCase();
    const chosen = new Set<ExpertSelection['experts'][number]>();
    const add = (...items: ExpertSelection['experts'][number][]) => items.forEach((item) => chosen.add(item));
    if (/passport|паспорт|portrait|портрет/.test(text)) add('LIGHTING', 'COMPOSITION', 'QUALITY');
    if (/fashion|мод|luxury|campaign|кампан/.test(text)) add('LIGHTING', 'FASHION', 'MARKETING', 'BRAND');
    if (/brand|бренд|logo|логотип/.test(text)) add('BRAND', 'COMPOSITION', 'MARKETING');
    if (/\bai\b|генера|replace|замен/.test(text)) add('AI', 'QUALITY', 'COST');
    if (!chosen.size) add('COMPOSITION', 'QUALITY');
    if (complexity >= 80) add('LIGHTING', 'BRAND', 'QUALITY', 'COST');
    return immutable({ experts: [...chosen], reasons: [`Selected from task semantics and complexity ${complexity}/100`] });
  }
}

export class HeuristicConflictResolutionModel implements ConflictResolutionModel {
  resolve(signals: readonly IntelligenceSignal[]): ConflictResolution {
    if (!signals.length) return immutable({ strategy: 'DEFER', authority: 'NONE', reason: 'No intelligence signal was supplied' });
    const totals = new Map<Strategy, number>();
    for (const signal of signals) totals.set(signal.strategy, (totals.get(signal.strategy) ?? 0) + clamp(signal.confidence));
    const strategy = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const authority = [...signals].filter((s) => s.strategy === strategy).sort((a, b) => b.confidence - a.confidence || a.source.localeCompare(b.source))[0].source;
    return immutable({ strategy, authority, reason: 'Confidence-weighted agreement resolved the conflict' });
  }
}

export class HeuristicConfidenceFusionModel implements ConfidenceFusionModel {
  fuse(signals: readonly IntelligenceSignal[], historical: number): ConfidenceResult {
    const weights = { DECISION: .3, DIRECTOR: .25, STUDIO: .25, QUALITY: .2 } as const;
    const components: Record<string, number> = { historical: clamp(historical) };
    let total = .2, score = components.historical * .2;
    for (const signal of signals) { const weight = weights[signal.source]; components[signal.source.toLowerCase()] = clamp(signal.confidence); score += clamp(signal.confidence) * weight; total += weight; }
    return immutable({ global: Number((score / total).toFixed(4)), components });
  }
}

export class HeuristicBudgetOptimizationModel implements BudgetOptimizationModel {
  assess(budget: CreativeBudget, complexity: number): BudgetAssessment {
    const remaining = Math.max(0, budget.total - budget.spent); const cost = Math.max(0, budget.aiUnitCost ?? 1); const value = Math.max(0, budget.expectedAiValue ?? complexity / 100);
    const aiWorthwhile = remaining >= cost && value >= cost / Math.max(1, budget.total);
    return immutable({ spent: budget.spent, remaining, recommended: aiWorthwhile ? 'AI' : 'LOCAL', aiWorthwhile, efficiency: Number((value / Math.max(cost, .01)).toFixed(3)) });
  }
}

export class HeuristicExecutionSchedulingModel implements ExecutionSchedulingModel {
  schedule(id: string, enabled: readonly IntelligenceKind[], complexity: number): ExecutionGraph {
    let previous: string[] = [];
    const nodes = enabled.map((kind, index) => { const nodeId = `${id}:node:${index}`; const parallel = kind === 'DIRECTOR' || kind === 'DECISION'; const dependsOn = parallel ? [] : previous.slice(); if (!parallel || index === 1) previous = [nodeId]; return { id: nodeId, kind, durationMs: Math.round(20 + complexity * (kind === 'STUDIO' ? 3 : 1)), dependsOn, parallelGroup: parallel ? 0 : index, status: 'PLANNED' as const }; });
    return immutable({ id: `${id}:graph`, nodes });
  }
}

export class HeuristicGovernanceModel implements GovernanceModel {
  govern(signals: readonly IntelligenceSignal[], complexity: number): GovernanceDecision {
    const by = (source: IntelligenceSignal['source']) => signals.find((s) => s.source === source);
    const decision = by('DECISION'); const director = by('DIRECTOR'); const studio = by('STUDIO');
    if (studio && complexity >= 70 && studio.confidence > (director?.confidence ?? 0) + .1) return immutable({ winner: 'STUDIO', reason: 'High-complexity studio evidence overrides direction' });
    if (director && director.confidence > (decision?.confidence ?? 0) + .15) return immutable({ winner: 'DIRECTOR', reason: 'Director has a decisive confidence advantage' });
    return immutable({ winner: 'DECISION', reason: 'Decision remains authoritative absent a governed override' });
  }
}

export class HeuristicOrchestratorLearningModel implements OrchestratorLearningModel { strategyKey(result: { finalStrategy: Strategy; plan: { mode: OperatingMode; complexity: number } }): string { return `${result.plan.mode}:${Math.floor(result.plan.complexity / 10)}:${result.finalStrategy}`; } }
