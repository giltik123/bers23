import { clamp, immutable, rounded } from './immutable';
import type { AttentionDimension, AttentionDistribution, AttentionPolicy, BlackboardState, CuriosityPolicy, LearningPolicy, SaliencyModel, SaliencySignals, SchedulingPolicy, StrategyPolicy, ThinkingProgram, WorkingMemorySnapshot } from './types';

const DIMENSIONS: readonly AttentionDimension[] = ['QUALITY', 'BRAND', 'COMPOSITION', 'COST', 'RISK', 'CREATIVITY', 'EMOTION', 'STORY', 'IDENTITY', 'CONSISTENCY'];

export class HeuristicSaliencyModel implements SaliencyModel {
  score(signals: SaliencySignals): number {
    return rounded(signals.novelty * .15 + signals.importance * .2 + signals.risk * .2 + signals.goalImpact * .2 + signals.confidence * .1 + signals.urgency * .15);
  }
}

export class HeuristicAttentionPolicy implements AttentionPolicy {
  distribute(state: BlackboardState): AttentionDistribution {
    const text = [...state.goals.map((goal) => goal.title), ...state.constraints, ...state.risks].join(' ').toLowerCase();
    const raw = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 1])) as Record<AttentionDimension, number>;
    if (/luxury|brand|люкс|бренд/.test(text)) { raw.BRAND += 4; raw.IDENTITY += 2; raw.QUALITY += 2; }
    if (/cost|budget|local|стоим|бюджет/.test(text)) { raw.COST += 5; raw.RISK += 2; }
    if (/portrait|passport|портрет|паспорт/.test(text)) { raw.QUALITY += 5; raw.COMPOSITION += 3; raw.CONSISTENCY += 2; }
    const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
    const normalized = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, Number((raw[dimension] / total).toFixed(6))])) as Record<AttentionDimension, number>;
    const drift = 1 - Object.values(normalized).reduce((sum, value) => sum + value, 0);
    normalized.CONSISTENCY = Number((normalized.CONSISTENCY + drift).toFixed(6));
    return immutable(normalized);
  }
}

export class HeuristicSchedulingPolicy implements SchedulingPolicy {
  decide(state: BlackboardState, memory: WorkingMemorySnapshot) {
    if (state.unknowns.length > 2) return immutable({ excludedExperts: [], action: 'REPLAY' as const, reason: 'Too many unresolved unknowns' });
    if (state.conflicts.some((conflict) => conflict.severity >= .75)) return immutable({ nextExpert: 'RISK', excludedExperts: [], action: 'THINK' as const, reason: 'Severe contradiction requires resolution' });
    if (state.goals.length > 0 && state.goals.every((goal) => goal.completion >= 1)) return immutable({ excludedExperts: state.experts, action: 'STOP' as const, reason: 'All goals are complete' });
    if (memory.activeThoughts.length >= memory.capacity) return immutable({ excludedExperts: [], action: 'REFLECT' as const, reason: 'Working memory is saturated' });
    const nextExpert = state.experts.find((expert) => !memory.debate.includes(expert));
    return immutable({ nextExpert, excludedExperts: state.experts.filter((expert) => expert === 'COST' && !state.constraints.some((item) => /cost|budget/i.test(item))), action: 'THINK' as const, reason: 'Continue with the next relevant expert' });
  }
}

export class HeuristicCuriosityPolicy implements CuriosityPolicy {
  explore(state: BlackboardState) {
    const goals = state.goals.slice().sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    return immutable(goals.slice(0, 3).map((goal, index) => ({ id: `alternative:${goal.id}:${index}`, description: `Invert the default approach for ${goal.title}`, novelty: rounded(.8 - index * .15), expectedValue: rounded(goal.weight * (.7 - index * .1)) })));
  }
}

export class HeuristicStrategyPolicy implements StrategyPolicy {
  compose(state: BlackboardState, programs: readonly ThinkingProgram[]) {
    const goalText = state.goals.map((goal) => goal.title).join(' ').toLowerCase();
    const traits = new Set<string>();
    if (/luxury|люкс/.test(goalText)) traits.add('LUXURY');
    if (/minimal|минимал/.test(goalText)) traits.add('MINIMAL');
    if (/cost|budget|стоим|бюджет/.test(goalText + state.constraints.join(' '))) traits.add('BUDGET');
    if (state.constraints.some((constraint) => /no ai|local|без ai/i.test(constraint))) traits.add('LOCAL_FIRST');
    if (!traits.size) traits.add('BALANCED');
    const selected = programs.filter((program) => program.dimensions.some((dimension) => state.goals.some((goal) => goal.title.toUpperCase().includes(dimension))));
    return immutable({ id: `strategy:${[...traits].join('+')}`, traits: [...traits], programs: selected.map((item) => item.name), rationale: state.goals.map((goal) => `Supports ${goal.title}`) });
  }
}

export class HeuristicLearningPolicy implements LearningPolicy {
  insights(outcomes: readonly { id: string; tags: readonly string[]; success: number }[]) {
    const support = new Map<string, string[]>();
    for (const outcome of outcomes.filter((item) => item.success >= .7)) {
      for (const tag of outcome.tags) support.set(tag, [...(support.get(tag) ?? []), outcome.id]);
    }
    return immutable([...support].filter(([, ids]) => ids.length >= 2).sort(([a], [b]) => a.localeCompare(b)).map(([tag, ids]) => ({ id: `insight:${tag}`, pattern: `${tag} correlates with successful creative outcomes`, support: rounded(ids.length / Math.max(2, outcomes.length)), sourceOutcomeIds: ids })));
  }
}
