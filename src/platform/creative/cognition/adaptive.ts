import { clamp, immutable, rounded } from './immutable';
import type { AttentionDimension, AttentionDistribution, CognitiveScope, Evidence, Thought } from './types';
import type { AdaptiveThinkingProgram, CognitiveExperiment, CognitivePerformance, CognitiveReflection, DecisionCandidate, DiscoveryScore, EmergentStrategy, EvidenceNetworkSnapshot, EvidenceRelation, KnowledgeGaps, MentalScenario, ProgramModule, ReasoningCycle, ReasoningLoopState, ReasoningMacro, ReasoningTransition, ReplayCursor, SelfMonitoringMetrics, TimelineV2Event, V2Dependencies, WorkspaceHypothesis, WorkspaceSnapshot } from './v2-types';

export class ActiveReasoningEngine {
  private static readonly actions = ['OBSERVE', 'ANALYZE', 'COMPARE', 'HYPOTHESIZE', 'CHALLENGE', 'REFINE', 'REFLECT', 'DECIDE'] as const;
  constructor(private readonly dependencies: V2Dependencies) {}
  reason(workspace: WorkspaceSnapshot): readonly ReasoningCycle[] { return immutable(ActiveReasoningEngine.actions.map((action, index) => ({ id: this.dependencies.nextId(), action, inputRevision: workspace.revision + index, outputRevision: workspace.revision + index + 1, summary: `${action.toLowerCase()} workspace evidence`, confidence: rounded(.55 + index * .05), at: this.dependencies.now() }))); }
}
export class ReasoningLoop {
  private static readonly states: readonly ReasoningLoopState[] = ['OBSERVE', 'ORIENT', 'REASON', 'DEBATE', 'CRITIQUE', 'SIMULATE', 'EVALUATE', 'REFLECT', 'LEARN', 'FINALIZE'];
  constructor(private readonly dependencies: V2Dependencies) {}
  run(trigger: string): readonly ReasoningTransition[] { return immutable(ReasoningLoop.states.slice(1).map((to, index) => ({ id: this.dependencies.nextId(), from: ReasoningLoop.states[index], to, reason: `Advance after ${ReasoningLoop.states[index].toLowerCase()}`, confidence: rounded(.6 + index * .035), trigger, at: this.dependencies.now() }))); }
}
export class ThinkingProgramComposer {
  constructor(private readonly dependencies: V2Dependencies) {}
  compose(input: { explore: boolean; verificationRisk: number; optimize: boolean; creative: boolean; constraints: readonly string[]; goals: readonly string[] }): AdaptiveThinkingProgram {
    const modules: ProgramModule[] = []; const rationale: string[] = [];
    if (input.explore) { modules.push('EXPLORATION'); rationale.push('Unknown solution space'); }
    if (input.verificationRisk > .3) { modules.push('VERIFICATION'); rationale.push('Material verification risk'); }
    if (input.goals.some((goal) => /brand/i.test(goal))) modules.push('BRAND');
    if (input.goals.some((goal) => /emotion/i.test(goal))) modules.push('EMOTION');
    if (input.goals.some((goal) => /composition/i.test(goal))) modules.push('COMPOSITION');
    if (input.creative) modules.push('CREATIVITY'); if (input.constraints.some((value) => /cost|budget/i.test(value))) modules.push('COST'); if (input.optimize) modules.push('OPTIMIZATION'); if (input.verificationRisk > .7) modules.push('SAFETY'); modules.push('REFLECTION', 'LEARNING');
    return immutable({ id: this.dependencies.nextId(), modules: [...new Set(modules)], rationale });
  }
}
export class DynamicAttentionController {
  redistribute(current: AttentionDistribution, event: { dimension: AttentionDimension; pressure: number }): AttentionDistribution {
    const raw = { ...current, [event.dimension]: clamp(current[event.dimension] + event.pressure) }; const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
    const normalized = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Number((value / total).toFixed(6))])) as Record<AttentionDimension, number>; const drift = 1 - Object.values(normalized).reduce((sum, value) => sum + value, 0); normalized[event.dimension] = Number((normalized[event.dimension] + drift).toFixed(6)); return immutable(normalized);
  }
}
export class HypothesisArena {
  compete(hypotheses: readonly WorkspaceHypothesis[], survivalThreshold = .35): readonly WorkspaceHypothesis[] { return immutable(hypotheses.map((item) => ({ ...item, survivalScore: rounded(item.confidence * .3 + item.support * .25 + item.predictedValue * .35 - item.contradictions * .25) })).filter((item) => item.survivalScore >= survivalThreshold).sort((a, b) => b.survivalScore - a.survivalScore || a.id.localeCompare(b.id))); }
}
export class EvidenceNetwork {
  build(evidence: readonly Evidence[], relations: readonly EvidenceRelation[]): EvidenceNetworkSnapshot { const ids = new Set(evidence.map((item) => item.id)); if (ids.size !== evidence.length) throw new Error('Evidence IDs must be unique'); for (const relation of relations) if (!ids.has(relation.from) || !ids.has(relation.to)) throw new Error('Evidence relation references an unknown node'); return immutable({ evidence: [...evidence], relations: [...relations] }); }
}
export class ExperimentPlanner {
  constructor(private readonly dependencies: V2Dependencies) {}
  plan(variable: string, baseline: { quality: number; cost: number; satisfaction: number }, change = '+5%'): CognitiveExperiment { const gain = this.dependencies.random() * .1; return immutable({ id: this.dependencies.nextId(), variable, change, expectedQuality: rounded(baseline.quality + gain), expectedCost: rounded(baseline.cost + gain * .5), expectedSatisfaction: rounded(baseline.satisfaction + gain * .8), status: 'PLANNED' }); }
}
export class CuriosityScheduler {
  decide(input: { unknowns: readonly string[]; fatigue: number; explored: number; budget: number }) { if (!input.unknowns.length || input.fatigue >= .8 || input.explored >= input.budget) return immutable({ explore: false, target: undefined, reason: 'Exploration stop condition reached' }); return immutable({ explore: true, target: input.unknowns[0], reason: 'Highest-priority unknown remains open' }); }
}
export class MentalSimulationEngine {
  constructor(private readonly dependencies: V2Dependencies) {}
  simulate(baseQuality: number, budget: number): readonly MentalScenario[] { const definitions: Array<[MentalScenario['strategy'], number, number, number]> = [['LOCAL', .02, 0, .02], ['HYBRID', .12, .35, .1], ['AI', .2, .8, .16], ['HYBRID_AI', .24, 1, .2], ['NO_AI', 0, 0, -.02]]; return immutable(definitions.map(([strategy, gain, cost, satisfaction]) => ({ id: this.dependencies.nextId(), strategy, quality: rounded(baseQuality + gain), cost: rounded(cost * budget), satisfaction: rounded(baseQuality + satisfaction), risk: rounded(cost * .4) }))); }
}
export class CognitiveReflectionEngine {
  constructor(private readonly dependencies: V2Dependencies) {}
  reflect(input: { cycles: readonly ReasoningCycle[]; before: readonly WorkspaceHypothesis[]; after: readonly WorkspaceHypothesis[]; unknowns: readonly string[] }): CognitiveReflection { const survivors = new Set(input.after.map((item) => item.id)); const before = new Set(input.before.map((item) => item.id)); return immutable({ id: this.dependencies.nextId(), useful: input.cycles.filter((item) => item.confidence >= .7).map((item) => item.action), unnecessary: input.cycles.filter((item) => item.confidence < .6).map((item) => item.action), eliminatedHypotheses: input.before.filter((item) => !survivors.has(item.id)).map((item) => item.id), newHypotheses: input.after.filter((item) => !before.has(item.id)).map((item) => item.id), verifyLater: [...input.unknowns], at: this.dependencies.now() }); }
}
export class SelfMonitoringEngine {
  monitor(input: { cycles: readonly ReasoningCycle[]; attention: AttentionDistribution; contradictions: number; hypothesesBefore: number; hypothesesAfter: number }): SelfMonitoringMetrics { const confidences = input.cycles.map((item) => item.confidence); const entropy = -Object.values(input.attention).reduce((sum, value) => sum + (value ? value * Math.log2(value) : 0), 0) / Math.log2(Object.keys(input.attention).length); return immutable({ thinkingDepth: rounded(input.cycles.length / 10), reasoningWidth: rounded(new Set(input.cycles.map((item) => item.action)).size / 8), attentionEntropy: rounded(entropy), contradictionRate: rounded(input.contradictions / Math.max(1, input.cycles.length)), confidenceDrift: rounded(Math.abs((confidences.at(-1) ?? 0) - (confidences[0] ?? 0))), hypothesisCollapse: rounded((input.hypothesesBefore - input.hypothesesAfter) / Math.max(1, input.hypothesesBefore)), cognitiveFatigue: rounded(input.cycles.length / 16 + input.contradictions * .05) }); }
}
export class MemoryCompressor {
  constructor(private readonly dependencies: V2Dependencies) {}
  compress(thoughts: readonly Thought[]): readonly ReasoningMacro[] { const groups = new Map<string, Thought[]>(); for (const item of thoughts) { const key = item.tags[0] ?? item.type; groups.set(key, [...(groups.get(key) ?? []), item]); } return immutable([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([pattern, items]) => ({ id: this.dependencies.nextId(), pattern, template: [...new Set(items.map((item) => item.type))], sourceThoughtIds: items.map((item) => item.id) }))); }
}
export class KnowledgeGapDetector {
  detect(input: { evidence: readonly Evidence[]; hypotheses: readonly WorkspaceHypothesis[]; questions: readonly string[] }): KnowledgeGaps { const evidenced = new Set(input.evidence.map((item) => item.claim)); const assumed = input.hypotheses.filter((item) => !item.evidenceIds.length).map((item) => item.statement); const known = [...evidenced].sort(); const unknown = input.questions.filter((question) => !known.some((claim) => question.toLowerCase().includes(claim.toLowerCase()))); return immutable({ known, assumed, unknown }); }
}
export class CreativeDiscoveryEngineV2 {
  score(input: { novelty: number; expectation: number; actual: number; rarity: number; risk: number; reward: number }): DiscoveryScore { const unexpectedness = Math.abs(input.actual - input.expectation); const riskReward = input.reward / Math.max(.01, input.risk + input.reward); return immutable({ novelty: rounded(input.novelty), unexpectedness: rounded(unexpectedness), originality: rounded((input.novelty + input.rarity) / 2), riskReward: rounded(riskReward), creativePotential: rounded(input.novelty * .3 + unexpectedness * .2 + input.rarity * .2 + riskReward * .3) }); }
}
export class EmergentStrategyGenerator {
  constructor(private readonly dependencies: V2Dependencies) {}
  generate(hypotheses: readonly WorkspaceHypothesis[], gaps: KnowledgeGaps): EmergentStrategy { const winners = [...hypotheses].sort((a, b) => b.survivalScore - a.survivalScore || a.id.localeCompare(b.id)).slice(0, 3); const principles = [...new Set([...winners.map((item) => item.statement), ...gaps.unknown.map((item) => `Verify ${item}`)])]; return immutable({ id: this.dependencies.nextId(), name: `EMERGENT_${winners.map((item) => item.id).join('_') || 'DISCOVERY'}`, principles, sourceHypothesisIds: winners.map((item) => item.id), novelty: rounded(.5 + gaps.unknown.length * .1) }); }
}
export class CognitivePerformanceModel {
  evaluate(metrics: SelfMonitoringMetrics, result: { completedPlans: number; totalPlans: number; insights: number; alternatives: number; resourceUsed: number }): CognitivePerformance { return immutable({ thinkingEfficiency: rounded((1 - metrics.cognitiveFatigue) * metrics.thinkingDepth), reasoningEfficiency: rounded(metrics.reasoningWidth * (1 - metrics.contradictionRate)), planningEfficiency: rounded(result.completedPlans / Math.max(1, result.totalPlans)), learningEfficiency: rounded(result.insights / Math.max(1, result.totalPlans)), creativityEfficiency: rounded(result.alternatives / Math.max(1, result.alternatives + result.totalPlans)), resourceEfficiency: rounded(1 - result.resourceUsed) }); }
}
export class UnifiedCognitiveTimelineV2 {
  constructor(private readonly dependencies: V2Dependencies) {}
  build(references: Partial<Record<TimelineV2Event['kind'], string>> = {}): readonly TimelineV2Event[] { const kinds: readonly TimelineV2Event['kind'][] = ['THOUGHT', 'HYPOTHESIS', 'EVIDENCE', 'DEBATE', 'SIMULATION', 'EXPERIMENT', 'REFLECTION', 'LEARNING', 'DECISION']; return immutable(kinds.map((kind, sequence) => ({ id: this.dependencies.nextId(), sequence, at: this.dependencies.now(), kind, referenceId: references[kind] }))); }
}
export class CognitiveReplayStudio {
  open(sessionId: string, events: readonly TimelineV2Event[]): ReplayCursor { return immutable({ sessionId, position: 0, events: [...events] }); }
  seek(cursor: ReplayCursor, position: number): ReplayCursor { if (!Number.isInteger(position) || position < 0 || position >= cursor.events.length) throw new Error('Replay position is out of bounds'); return immutable({ ...cursor, position }); }
  rewind(cursor: ReplayCursor, steps = 1): ReplayCursor { return immutable({ ...cursor, position: Math.max(0, cursor.position - Math.max(0, steps)) }); }
  replaceHypothesis(cursor: ReplayCursor, eventId: string): ReplayCursor { const index = cursor.events.findIndex((item) => item.kind === 'HYPOTHESIS'); if (index < 0) throw new Error('Replay has no hypothesis step'); const events = cursor.events.map((item, itemIndex) => itemIndex === index ? { ...item, referenceId: eventId } : item); return immutable({ ...cursor, position: index, events }); }
  repeat(cursor: ReplayCursor): ReplayCursor { return immutable({ ...cursor, position: 0 }); }
  compare(left: ReplayCursor, right: ReplayCursor) { const length = Math.max(left.events.length, right.events.length); const differences = Array.from({ length }, (_, index) => index).filter((index) => JSON.stringify(left.events[index]) !== JSON.stringify(right.events[index])); return immutable({ identical: differences.length === 0, differences }); }
}
