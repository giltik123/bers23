import {
  type ConfidenceProfile,
  type DecisionExperiment,
  type DeterministicDependencies,
  type EncodedDecisionFeatures,
} from './cognitive';
import {
  type DecisionModel,
  type Metrics,
  type Scope,
  immutable,
} from './index';

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const round = (value: number) => Number(value.toFixed(6));
const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const scopeKey = (scope: Scope) => `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;
const assertSameScope = (left: Scope, right: Scope, message: string) => {
  if (scopeKey(left) !== scopeKey(right)) throw new Error(message);
};

export interface CausalRelation {
  readonly id: string;
  readonly scope: Scope;
  readonly cause: string;
  readonly effect: string;
  readonly causalStrength: number;
  readonly support: number;
  readonly confidence: number;
  readonly counterEvidence: number;
  readonly lastUpdated: number;
}

export interface CausalObservation {
  readonly scope: Scope;
  readonly path: readonly string[];
  readonly successful: boolean;
  readonly timestamp?: number;
}

export class CreativeCausalLearningEngine {
  constructor(
    private readonly dependencies: Pick<DeterministicDependencies, 'id' | 'clock'>,
    private readonly relations: readonly CausalRelation[] = [],
  ) {}

  learn(observation: CausalObservation): CreativeCausalLearningEngine {
    if (observation.path.length < 2) return this;
    let next = [...this.relations];
    for (let index = 0; index < observation.path.length - 1; index += 1) {
      const cause = observation.path[index], effect = observation.path[index + 1];
      const existing = next.find(relation =>
        scopeKey(relation.scope) === scopeKey(observation.scope)
        && relation.cause === cause
        && relation.effect === effect);
      const support = (existing?.support ?? 0) + (observation.successful ? 1 : 0);
      const counterEvidence = (existing?.counterEvidence ?? 0) + (observation.successful ? 0 : 1);
      const evidence = support + counterEvidence;
      const relation: CausalRelation = immutable({
        id: existing?.id ?? this.dependencies.id(),
        scope: { ...observation.scope }, cause, effect,
        causalStrength: round(evidence === 0 ? 0 : (support - counterEvidence) / evidence),
        support,
        confidence: round(evidence / (evidence + 5)),
        counterEvidence,
        lastUpdated: observation.timestamp ?? this.dependencies.clock(),
      });
      next = [...next.filter(item => item !== existing), relation];
    }
    return new CreativeCausalLearningEngine(this.dependencies, immutable(next));
  }

  graph(scope: Scope): readonly CausalRelation[] {
    return immutable(this.relations
      .filter(relation => scopeKey(relation.scope) === scopeKey(scope))
      .sort((left, right) => left.cause.localeCompare(right.cause) || left.effect.localeCompare(right.effect)));
  }

  explain(scope: Scope, cause: string, effect: string) {
    const direct = this.graph(scope).find(relation => relation.cause === cause && relation.effect === effect);
    return immutable({ cause, effect, supported: Boolean(direct && direct.causalStrength > 0), relation: direct });
  }
}

export interface CounterfactualAlternative {
  readonly id: string;
  readonly mode: string;
  readonly quality: number;
  readonly credits: number;
  readonly latency: number;
  readonly satisfaction: number;
  readonly probability: number;
}

export interface CounterfactualResult {
  readonly alternative: CounterfactualAlternative;
  readonly qualityDelta: number;
  readonly creditDelta: number;
  readonly latencyDelta: number;
  readonly satisfactionDelta: number;
  readonly expectedUtilityDelta: number;
  readonly justified: boolean;
  readonly explanation: string;
}

export class CounterfactualDecisionEngine {
  compare(selected: CounterfactualAlternative, alternatives: readonly CounterfactualAlternative[]): readonly CounterfactualResult[] {
    return immutable(alternatives.filter(item => item.id !== selected.id).map(alternative => {
      const qualityDelta = round(alternative.quality - selected.quality);
      const creditDelta = round(alternative.credits - selected.credits);
      const latencyDelta = round(alternative.latency - selected.latency);
      const satisfactionDelta = round(alternative.satisfaction - selected.satisfaction);
      const expectedUtilityDelta = round(
        alternative.probability * (qualityDelta + satisfactionDelta * 0.5)
        - creditDelta / 100 - latencyDelta / 10000,
      );
      const justified = expectedUtilityDelta > 0;
      return {
        alternative, qualityDelta, creditDelta, latencyDelta, satisfactionDelta,
        expectedUtilityDelta, justified,
        explanation: `${alternative.mode}: ${qualityDelta >= 0 ? '+' : ''}${qualityDelta} quality for ${creditDelta >= 0 ? '+' : ''}${creditDelta} credits — ${justified ? 'justified' : 'not justified'}`,
      };
    }).sort((left, right) => right.expectedUtilityDelta - left.expectedUtilityDelta || left.alternative.id.localeCompare(right.alternative.id)));
  }
}

export interface CreativePrinciple {
  readonly id: string;
  readonly domain: string;
  readonly recommendation: string;
  readonly weight: number;
  readonly confidence: number;
  readonly source: string;
  readonly supportCount: number;
}

export class CreativePrincipleLibrary {
  constructor(private readonly principles: readonly CreativePrinciple[] = []) {}

  add(principle: CreativePrinciple): CreativePrincipleLibrary {
    const normalized = immutable({
      ...principle,
      weight: clamp(principle.weight),
      confidence: clamp(principle.confidence),
      supportCount: Math.max(0, Math.floor(principle.supportCount)),
    });
    return new CreativePrincipleLibrary(immutable([
      ...this.principles.filter(item => item.id !== principle.id), normalized,
    ]));
  }

  forDomain(domain: string): readonly CreativePrinciple[] {
    return immutable(this.principles.filter(item => item.domain === domain)
      .sort((left, right) => right.weight * right.confidence - left.weight * left.confidence
        || left.id.localeCompare(right.id)));
  }

  all(): readonly CreativePrinciple[] { return immutable([...this.principles]); }
}

export interface TasteSignal {
  readonly dimension: string;
  readonly value: number;
  readonly preferred: number;
  readonly weight: number;
}

export class HumanTasteModel {
  evaluate(technicalSignals: readonly number[], tasteSignals: readonly TasteSignal[]) {
    const technicalQuality = round(clamp(mean(technicalSignals)) * 100);
    const weight = tasteSignals.reduce((sum, signal) => sum + Math.max(0, signal.weight), 0);
    const taste = weight === 0 ? 0 : tasteSignals.reduce((sum, signal) =>
      sum + (1 - Math.abs(clamp(signal.value) - clamp(signal.preferred))) * Math.max(0, signal.weight), 0) / weight;
    return immutable({
      technicalQuality,
      creativePreference: round(clamp(taste) * 100),
      alignment: immutable(Object.fromEntries(tasteSignals.map(signal => [
        signal.dimension,
        round(1 - Math.abs(clamp(signal.value) - clamp(signal.preferred))),
      ]))),
    });
  }
}

export interface DecisionOutcomeEvidence {
  readonly scope: Scope;
  readonly helpful: readonly string[];
  readonly harmful: readonly string[];
  readonly useless: readonly string[];
  readonly alternatives: readonly string[];
  readonly aiUsed: boolean;
  readonly localQuality: number;
  readonly finalQuality: number;
  readonly credits: number;
}

export class DecisionReflectionEngine {
  constructor(private readonly dependencies: Pick<DeterministicDependencies, 'id' | 'clock'>) {}

  reflect(evidence: DecisionOutcomeEvidence) {
    const aiGain = round(evidence.finalQuality - evidence.localQuality);
    return immutable({
      id: this.dependencies.id(), scope: { ...evidence.scope }, createdAt: this.dependencies.clock(),
      whatHelped: [...evidence.helpful].sort(),
      whatHarmed: [...evidence.harmful].sort(),
      whatWasUseless: [...evidence.useless].sort(),
      tryLater: [...evidence.alternatives].sort(),
      canRemoveAI: evidence.aiUsed && (aiGain <= 0.03 || evidence.credits > aiGain * 200),
      aiGain,
    });
  }
}

export type ExplorationMode = 'EXPLOIT' | 'EXPLORE' | 'BALANCED';
export class ExplorationPolicy {
  choose(input: { confidence: number; experience: number; risk: number; noveltyNeed: number; budgetPressure: number }): ExplorationMode {
    const exploration = clamp(input.noveltyNeed * 0.45 + (1 - input.confidence) * 0.3 + (1 - input.experience) * 0.25);
    const safety = clamp(input.risk * 0.55 + input.budgetPressure * 0.45);
    return exploration - safety > 0.25 ? 'EXPLORE' : safety - exploration > 0.25 ? 'EXPLOIT' : 'BALANCED';
  }
}

export interface CompressibleDecision {
  readonly scope: Scope;
  readonly operations: readonly string[];
  readonly intent: string;
  readonly quality: number;
  readonly cost: number;
  readonly accepted: boolean;
}
export interface DecisionTemplate {
  readonly id: string;
  readonly scope: Scope;
  readonly name: string;
  readonly operations: readonly string[];
  readonly count: number;
  readonly acceptance: number;
  readonly averageQuality: number;
  readonly averageCost: number;
}

export class DecisionCompressionEngine {
  constructor(private readonly id: () => string) {}

  compress(decisions: readonly CompressibleDecision[]): readonly DecisionTemplate[] {
    const groups = new Map<string, CompressibleDecision[]>();
    for (const decision of decisions) {
      const signature = `${scopeKey(decision.scope)}\u0000${decision.intent}\u0000${[...decision.operations].sort().join('+')}`;
      groups.set(signature, [...(groups.get(signature) ?? []), decision]);
    }
    return immutable([...groups].map(([, group]) => ({
      id: this.id(), scope: { ...group[0].scope }, name: group[0].intent,
      operations: [...group[0].operations].sort(), count: group.length,
      acceptance: round(group.filter(item => item.accepted).length / group.length),
      averageQuality: round(mean(group.map(item => item.quality))),
      averageCost: round(mean(group.map(item => item.cost))),
    })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)));
  }
}

export type TimelineKind = 'TASTE' | 'STRATEGY' | 'ARCHETYPE' | 'DNA';
export interface CreativeTimelineEvent {
  readonly id: string;
  readonly scope: Scope;
  readonly timestamp: number;
  readonly kind: TimelineKind;
  readonly value: Readonly<Record<string, unknown>>;
}
export class CreativeTimeline {
  constructor(private readonly events: readonly CreativeTimelineEvent[] = []) {}
  add(event: CreativeTimelineEvent) {
    if (this.events.some(item => item.id === event.id)) return this;
    return new CreativeTimeline(immutable([...this.events, { ...event, scope: { ...event.scope }, value: { ...event.value } }]));
  }
  forScope(scope: Scope, kind?: TimelineKind) {
    return immutable(this.events.filter(event => scopeKey(event.scope) === scopeKey(scope) && (!kind || event.kind === kind))
      .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id)));
  }
}

export interface ExpertAssessment {
  readonly expertId: string;
  readonly domain: string;
  readonly score: number;
  readonly confidence: number;
  readonly explanation: string;
}
export interface CreativeExpert {
  readonly id: string;
  readonly domain: string;
  assess(candidate: DecisionExperiment): ExpertAssessment;
}
export class HeuristicCreativeExpert implements CreativeExpert {
  constructor(readonly id: string, readonly domain: string, private readonly metric: keyof Metrics) {}
  assess(candidate: DecisionExperiment): ExpertAssessment {
    const raw = Number(candidate.predicted[this.metric]);
    const score = this.metric === 'cost' || this.metric === 'latency' || this.metric === 'risk'
      ? clamp(1 - raw / (this.metric === 'latency' ? 10000 : this.metric === 'cost' ? 100 : 1)) : clamp(raw);
    return immutable({ expertId: this.id, domain: this.domain, score: round(score), confidence: candidate.predicted.probability, explanation: `${this.domain} assessed ${this.metric}` });
  }
}
export class ExpertCouncil {
  constructor(private readonly experts: readonly CreativeExpert[]) {}
  evaluate(candidate: DecisionExperiment) {
    const assessments = this.experts.map(expert => expert.assess(candidate));
    const confidenceWeight = assessments.reduce((sum, item) => sum + item.confidence, 0);
    const score = confidenceWeight === 0 ? 0 : assessments.reduce((sum, item) => sum + item.score * item.confidence, 0) / confidenceWeight;
    return immutable({ candidateId: candidate.id, score: round(score), assessments });
  }
}

export interface HeuristicWeights { readonly [name: string]: number }
export interface HeuristicFeedback { readonly predicted: number; readonly actual: number; readonly contribution: Readonly<Record<string, number>> }
export class AdaptiveHeuristicEngine {
  adapt(weights: HeuristicWeights, feedback: HeuristicFeedback, learningRate = 0.05) {
    const error = round(feedback.actual - feedback.predicted);
    const updated = Object.fromEntries(Object.keys(weights).sort().map(name => [
      name,
      round(clamp(weights[name] + learningRate * error * (feedback.contribution[name] ?? 0), 0, 10)),
    ]));
    const explanations = Object.keys(updated).filter(name => updated[name] !== weights[name]).map(name =>
      `${name}: ${weights[name]} → ${updated[name]} because prediction error was ${error}`);
    return immutable({ weights: updated, error, explanations });
  }
}

export interface DecisionBenchmarkCase {
  readonly id: string;
  readonly expected: Readonly<{ quality: number; credits: number; latency: number; satisfaction: number; stability: number; decisionConsistency: number }>;
  readonly actual: Readonly<{ quality: number; credits: number; latency: number; satisfaction: number; stability: number; decisionConsistency: number }>;
  readonly tolerances: Readonly<Partial<Record<keyof DecisionBenchmarkCase['expected'], number>>>;
}
export class DecisionBenchmarkSuite {
  evaluate(cases: readonly DecisionBenchmarkCase[]) {
    const results = [...cases].sort((a, b) => a.id.localeCompare(b.id)).map(item => {
      const metrics = Object.keys(item.expected).map(metric => {
        const name = metric as keyof typeof item.expected;
        const delta = round(item.actual[name] - item.expected[name]);
        return { metric: name, delta, passed: Math.abs(delta) <= (item.tolerances[name] ?? 0) };
      });
      return { id: item.id, metrics, passed: metrics.every(metric => metric.passed) };
    });
    return immutable({ results, passed: results.every(result => result.passed), passRate: round(results.filter(result => result.passed).length / Math.max(1, results.length)) });
  }
}

export interface PrincipleGeneration {
  readonly id: string;
  readonly principleId: string;
  readonly generation: number;
  readonly parentId?: string;
  readonly children: readonly string[];
  readonly confidence: number;
  readonly support: number;
  readonly createdAt: number;
}
export class KnowledgeEvolutionEngine {
  constructor(private readonly dependencies: Pick<DeterministicDependencies, 'id' | 'clock'>, private readonly generations: readonly PrincipleGeneration[] = []) {}
  evolve(principleId: string, confidence: number, support: number, parentId?: string): KnowledgeEvolutionEngine {
    const parent = parentId ? this.generations.find(item => item.id === parentId) : undefined;
    if (parentId && !parent) throw new Error('Knowledge parent does not exist');
    const id = this.dependencies.id();
    const child: PrincipleGeneration = immutable({ id, principleId, generation: (parent?.generation ?? 0) + 1, parentId, children: [], confidence: clamp(confidence), support: Math.max(0, support), createdAt: this.dependencies.clock() });
    const updated = this.generations.map(item => item.id === parentId ? immutable({ ...item, children: [...item.children, id] }) : item);
    return new KnowledgeEvolutionEngine(this.dependencies, immutable([...updated, child]));
  }
  history(principleId: string) { return immutable(this.generations.filter(item => item.principleId === principleId).sort((a, b) => a.generation - b.generation || a.id.localeCompare(b.id))); }
}

export class DecisionExplainabilityV5 {
  trace(values: Partial<Record<string, unknown>>) {
    const names = ['Prompt', 'Intent Space', 'Goals', 'Constraints', 'World State', 'Gap Analysis', 'Candidate Generation', 'Counterfactual Analysis', 'Causal Graph', 'Creative Principles', 'Expert Council', 'Decision Tournament', 'Winner', 'Reflection', 'Learning', 'Creative DNA', 'Decision Model'];
    const stages = names.map(name => ({ name, value: values[name] ?? null }));
    return immutable({ version: 5, stages, text: stages.map(stage => `${stage.name}: ${JSON.stringify(stage.value)}`).join('\n') });
  }
}

export interface DecisionEvolutionFactors {
  readonly learning: number; readonly stability: number; readonly creativity: number;
  readonly adaptability: number; readonly costEfficiency: number; readonly goalCompletion: number;
  readonly tasteAlignment: number; readonly technicalQuality: number; readonly confidence: number;
}
export class DecisionEvolutionScore {
  calculate(factors: DecisionEvolutionFactors) {
    const weights: Record<keyof DecisionEvolutionFactors, number> = { learning: .12, stability: .12, creativity: .1, adaptability: .1, costEfficiency: .1, goalCompletion: .14, tasteAlignment: .12, technicalQuality: .12, confidence: .08 };
    const contributions = Object.fromEntries(Object.entries(weights).map(([name, weight]) => [name, round(clamp(factors[name as keyof DecisionEvolutionFactors]) * weight * 100)]));
    return immutable({ score: round(Object.values(contributions).reduce((sum, value) => sum + value, 0)), contributions });
  }
}

export interface DecisionRepresentation { readonly version: string; readonly vector: readonly number[]; readonly labels: readonly string[] }
export interface DecisionEncoder { encode(features: EncodedDecisionFeatures): DecisionRepresentation }
export interface DecisionDecoder { decode(representation: DecisionRepresentation): Readonly<Record<string, number>> }
export interface DecisionPolicy { select(representations: readonly DecisionRepresentation[]): number }
export interface DecisionReward { calculate(predicted: Metrics, actual: Metrics, confidence?: ConfidenceProfile): number }
export interface DecisionLoss { calculate(predicted: Metrics, actual: Metrics): number }
export interface DecisionReplayEntry { readonly id: string; readonly scope: Scope; readonly representation: DecisionRepresentation; readonly reward: number; readonly timestamp: number }
export interface DecisionReplayBuffer { add(entry: DecisionReplayEntry): DecisionReplayBuffer; sample(scope: Scope, count: number): readonly DecisionReplayEntry[] }
export interface DecisionEvaluator { evaluate(model: DecisionModel, cases: readonly DecisionBenchmarkCase[]): Readonly<Record<string, unknown>> }
export interface DecisionInferenceSession { readonly id: string; readonly modelVersion: string; infer(representation: DecisionRepresentation): Metrics }

export class HeuristicDecisionEncoder implements DecisionEncoder {
  encode(features: EncodedDecisionFeatures) { return immutable({ version: 'heuristic-representation-v1', vector: [...features.values], labels: [...features.names] }); }
}
export class HeuristicDecisionDecoder implements DecisionDecoder {
  decode(representation: DecisionRepresentation) { return immutable(Object.fromEntries(representation.labels.map((label, index) => [label, representation.vector[index] ?? 0]))); }
}
export class HeuristicDecisionPolicy implements DecisionPolicy {
  select(representations: readonly DecisionRepresentation[]) { if (representations.length === 0) return -1; return representations.map((item, index) => ({ index, score: mean(item.vector) })).sort((a, b) => b.score - a.score || a.index - b.index)[0].index; }
}
export class HeuristicDecisionReward implements DecisionReward {
  calculate(predicted: Metrics, actual: Metrics, confidence?: ConfidenceProfile) { return round(actual.quality + actual.satisfaction - actual.risk - actual.cost / 100 - Math.abs(actual.quality - predicted.quality) + (confidence?.overall ?? 0) * .1); }
}
export class HeuristicDecisionLoss implements DecisionLoss {
  calculate(predicted: Metrics, actual: Metrics) { const keys = Object.keys(predicted) as (keyof Metrics)[]; return round(mean(keys.map(key => (predicted[key] - actual[key]) ** 2))); }
}
export class ImmutableDecisionReplayBuffer implements DecisionReplayBuffer {
  constructor(private readonly entries: readonly DecisionReplayEntry[] = []) {}
  add(entry: DecisionReplayEntry) { return new ImmutableDecisionReplayBuffer(immutable([...this.entries.filter(item => item.id !== entry.id), { ...entry, scope: { ...entry.scope }, representation: { ...entry.representation, vector: [...entry.representation.vector], labels: [...entry.representation.labels] } }])); }
  sample(scope: Scope, count: number) { return immutable(this.entries.filter(entry => scopeKey(entry.scope) === scopeKey(scope)).sort((a, b) => b.reward - a.reward || a.timestamp - b.timestamp || a.id.localeCompare(b.id)).slice(0, Math.max(0, count))); }
}
export class HeuristicDecisionEvaluator implements DecisionEvaluator {
  evaluate(_model: DecisionModel, cases: readonly DecisionBenchmarkCase[]) { return new DecisionBenchmarkSuite().evaluate(cases); }
}
export class HeuristicDecisionInferenceSession implements DecisionInferenceSession {
  readonly modelVersion: string;
  constructor(readonly id: string, private readonly model: DecisionModel, private readonly decoder: DecisionDecoder = new HeuristicDecisionDecoder()) { this.modelVersion = model.version(); }
  infer(representation: DecisionRepresentation) { return this.model.predict(this.decoder.decode(representation)); }
}
