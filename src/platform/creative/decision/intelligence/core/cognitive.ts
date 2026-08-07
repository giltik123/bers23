import {
  type DecisionModel,
  type Metrics,
  type ModelSample,
  type Scope,
  immutable,
} from './index';

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const round = (value: number) => Number(value.toFixed(6));
const average = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const scopeKey = (scope: Scope) => `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;
const sameScope = (left: Scope, right: Scope) => scopeKey(left) === scopeKey(right);

export interface IntentProbability {
  readonly intent: string;
  readonly probability: number;
}

export interface IntentDistribution {
  readonly scope: Scope;
  readonly intents: readonly IntentProbability[];
  readonly entropy: number;
}

export class CreativeIntentSpace {
  create(scope: Scope, scores: Readonly<Record<string, number>>): IntentDistribution {
    const positive = Object.entries(scores)
      .map(([intent, score]) => [intent, Math.max(0, score)] as const)
      .sort(([left], [right]) => left.localeCompare(right));
    const total = positive.reduce((sum, [, score]) => sum + score, 0);
    const intents = positive
      .map(([intent, score]) => ({ intent, probability: round(total === 0 ? 0 : score / total) }))
      .sort((left, right) => right.probability - left.probability || left.intent.localeCompare(right.intent));
    const entropy = -intents.reduce(
      (sum, item) => sum + (item.probability > 0 ? item.probability * Math.log2(item.probability) : 0),
      0,
    );
    return immutable({ scope: { ...scope }, intents, entropy: round(entropy) });
  }

  combine(left: IntentDistribution, right: IntentDistribution, rightWeight = 0.5): IntentDistribution {
    if (!sameScope(left.scope, right.scope)) throw new Error('Cannot combine intent spaces from different scopes');
    const weight = clamp(rightWeight);
    const names = new Set([...left.intents.map(item => item.intent), ...right.intents.map(item => item.intent)]);
    const score = (space: IntentDistribution, intent: string) =>
      space.intents.find(item => item.intent === intent)?.probability ?? 0;
    return this.create(left.scope, Object.fromEntries([...names].map(intent => [
      intent,
      score(left, intent) * (1 - weight) + score(right, intent) * weight,
    ])));
  }
}

export interface CreativeGoalNode {
  readonly id: string;
  readonly title: string;
  readonly weight: number;
  readonly children: readonly CreativeGoalNode[];
}

export class CreativeGoalHierarchy {
  create(id: string, title: string, weight = 1, children: readonly CreativeGoalNode[] = []): CreativeGoalNode {
    return immutable({ id, title, weight: clamp(weight), children: [...children] });
  }

  path(root: CreativeGoalNode, targetId: string): readonly CreativeGoalNode[] {
    if (root.id === targetId) return immutable([root]);
    for (const child of root.children) {
      const nested = this.path(child, targetId);
      if (nested.length > 0) return immutable([root, ...nested]);
    }
    return immutable([]);
  }

  leaves(root: CreativeGoalNode): readonly CreativeGoalNode[] {
    if (root.children.length === 0) return immutable([root]);
    return immutable(root.children.flatMap(child => this.leaves(child)));
  }
}

export type WorldDimension =
  | 'background' | 'face' | 'lighting' | 'objects' | 'style' | 'camera'
  | 'quality' | 'noise' | 'composition' | 'colorBalance' | 'visualHierarchy';

export interface WorldAttribute {
  readonly value: string | number | boolean;
  readonly confidence: number;
  readonly source: string;
}

export interface CreativeWorldStateSnapshot {
  readonly scope: Scope;
  readonly revision: number;
  readonly attributes: Readonly<Partial<Record<WorldDimension, WorldAttribute>>>;
}

export class CreativeWorldState {
  create(scope: Scope): CreativeWorldStateSnapshot {
    return immutable({ scope: { ...scope }, revision: 1, attributes: {} });
  }

  update(
    state: CreativeWorldStateSnapshot,
    changes: Readonly<Partial<Record<WorldDimension, WorldAttribute>>>,
  ): CreativeWorldStateSnapshot {
    const attributes = Object.fromEntries(Object.entries({ ...state.attributes, ...changes }).map(([key, attribute]) => [
      key,
      { ...attribute, confidence: clamp(attribute.confidence) },
    ]));
    return immutable({ scope: state.scope, revision: state.revision + 1, attributes });
  }
}

export interface CreativeGap {
  readonly dimension: string;
  readonly current: unknown;
  readonly desired: unknown;
  readonly severity: number;
  readonly explanation: string;
}

export class CreativeGapAnalyzer {
  analyze(current: CreativeWorldStateSnapshot, desired: CreativeWorldStateSnapshot): readonly CreativeGap[] {
    if (!sameScope(current.scope, desired.scope)) throw new Error('Cannot compare world states from different scopes');
    const dimensions = new Set([...Object.keys(current.attributes), ...Object.keys(desired.attributes)]);
    return immutable([...dimensions].flatMap(dimension => {
      const before = current.attributes[dimension as WorldDimension];
      const after = desired.attributes[dimension as WorldDimension];
      if (before?.value === after?.value) return [];
      const severity = round((after?.confidence ?? 1) * (before ? 1 : 0.75));
      return [{
        dimension,
        current: before?.value,
        desired: after?.value,
        severity,
        explanation: `${dimension}: ${String(before?.value ?? 'unknown')} → ${String(after?.value ?? 'unknown')}`,
      }];
    }).sort((left, right) => right.severity - left.severity || left.dimension.localeCompare(right.dimension)));
  }
}

export type PlanStepKind = 'OPERATION' | 'QUALITY_CHECK' | 'DECISION' | 'FINISH';
export interface CreativePlanStep {
  readonly id: string;
  readonly kind: PlanStepKind;
  readonly operation?: string;
  readonly dependsOn: readonly string[];
  readonly children: readonly CreativePlanStep[];
  readonly condition?: string;
}
export interface CreativeExecutionPlan {
  readonly id: string;
  readonly scope: Scope;
  readonly goalId: string;
  readonly steps: readonly CreativePlanStep[];
}

export interface DeterministicDependencies {
  readonly id: () => string;
  readonly clock: () => number;
  readonly random: () => number;
}

export class MultiStepCreativePlanner {
  constructor(private readonly dependencies: DeterministicDependencies) {}

  create(scope: Scope, goalId: string, operations: readonly string[]): CreativeExecutionPlan {
    let previous: string | undefined;
    const steps: CreativePlanStep[] = operations.map(operation => {
      const id = this.dependencies.id();
      const step = { id, kind: 'OPERATION' as const, operation, dependsOn: previous ? [previous] : [], children: [] };
      previous = id;
      return step;
    });
    const qualityId = this.dependencies.id();
    steps.push({ id: qualityId, kind: 'QUALITY_CHECK', dependsOn: previous ? [previous] : [], children: [] });
    steps.push({ id: this.dependencies.id(), kind: 'FINISH', dependsOn: [qualityId], children: [] });
    return immutable({ id: this.dependencies.id(), scope: { ...scope }, goalId, steps });
  }
}

export interface CreativeHypothesis {
  readonly id: string;
  readonly scope: Scope;
  readonly premise: string;
  readonly consequence: string;
  readonly confidence: number;
  readonly probability: number;
  readonly expectedGain: number;
}

export class CreativeHypothesisEngine {
  constructor(private readonly id: () => string) {}

  generate(scope: Scope, gaps: readonly CreativeGap[]): readonly CreativeHypothesis[] {
    return immutable(gaps.map(gap => ({
      id: this.id(),
      scope: { ...scope },
      premise: `Resolve ${gap.dimension}`,
      consequence: `Move ${gap.dimension} toward ${String(gap.desired)}`,
      confidence: round(clamp(gap.severity * 0.9)),
      probability: round(clamp(0.5 + gap.severity * 0.4)),
      expectedGain: round(gap.severity * 100),
    })));
  }
}

export interface DecisionExperiment {
  readonly id: string;
  readonly scope: Scope;
  readonly strategy: string;
  readonly operations: readonly string[];
  readonly predicted: Metrics;
  readonly score: number;
}

export class DecisionExperimentEngine {
  constructor(private readonly model: DecisionModel, private readonly id: () => string) {}

  run(scope: Scope, strategies: Readonly<Record<string, readonly string[]>>): readonly DecisionExperiment[] {
    const experiments = Object.entries(strategies).map(([strategy, operations]) => {
      const features = Object.fromEntries(operations.map(operation => [operation, 1]));
      const predicted = this.model.predict(features);
      return {
        id: this.id(), scope: { ...scope }, strategy, operations: [...operations], predicted,
        score: round(predicted.quality + predicted.satisfaction - predicted.risk - predicted.cost / 100),
      };
    });
    return immutable(experiments.sort((left, right) => right.score - left.score || left.strategy.localeCompare(right.strategy)));
  }
}

export interface CreativeOpportunity {
  readonly dimension: string;
  readonly operation: string;
  readonly reason: string;
  readonly local: boolean;
  readonly expectedGain: number;
}

export class CreativeOpportunityDetector {
  detect(state: CreativeWorldStateSnapshot): readonly CreativeOpportunity[] {
    const opportunities: CreativeOpportunity[] = [];
    const lighting = Number(state.attributes.lighting?.value);
    const face = Number(state.attributes.face?.value);
    const background = state.attributes.background?.value;
    if (Number.isFinite(lighting) && lighting < 0.5) opportunities.push({ dimension: 'lighting', operation: 'light_adjustment', reason: 'Lighting is below target', local: true, expectedGain: round((0.7 - lighting) * 100) });
    if (Number.isFinite(face) && face < 0.5) opportunities.push({ dimension: 'face', operation: 'local_face_brightness', reason: 'Face is too dark', local: true, expectedGain: round((0.65 - face) * 100) });
    if (background === 'good') opportunities.push({ dimension: 'background', operation: 'preserve_background', reason: 'Existing background is already suitable', local: true, expectedGain: 0 });
    return immutable(opportunities.sort((left, right) => right.expectedGain - left.expectedGain || left.dimension.localeCompare(right.dimension)));
  }
}

export interface ConfidenceProfile {
  readonly technical: number;
  readonly creative: number;
  readonly goal: number;
  readonly economic: number;
  readonly historical: number;
  readonly preference: number;
  readonly overall: number;
}

export class DecisionConfidenceDecomposer {
  create(input: Omit<ConfidenceProfile, 'overall'>): ConfidenceProfile {
    const normalized = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, clamp(value)])) as Omit<ConfidenceProfile, 'overall'>;
    const values = Object.values(normalized);
    const harmonic = values.some(value => value === 0) ? 0 : values.length / values.reduce((sum, value) => sum + 1 / value, 0);
    return immutable({ ...normalized, overall: round(harmonic) });
  }
}

export type UncertaintyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
export interface UncertaintyItem { readonly dimension: string; readonly uncertainty: number; readonly level: UncertaintyLevel }
export class CreativeUncertaintyMap {
  fromWorldState(state: CreativeWorldStateSnapshot): readonly UncertaintyItem[] {
    const dimensions: readonly WorldDimension[] = ['background', 'face', 'lighting', 'objects', 'style', 'camera', 'quality', 'noise', 'composition', 'colorBalance', 'visualHierarchy'];
    return immutable(dimensions.map(dimension => {
      const uncertainty = round(1 - (state.attributes[dimension]?.confidence ?? 0));
      const level: UncertaintyLevel = uncertainty >= 0.8 ? 'VERY_HIGH' : uncertainty >= 0.6 ? 'HIGH' : uncertainty >= 0.3 ? 'MEDIUM' : 'LOW';
      return { dimension, uncertainty, level };
    }).sort((left, right) => right.uncertainty - left.uncertainty || left.dimension.localeCompare(right.dimension)));
  }
}

export interface DecisionQuestion { readonly id: string; readonly text: string; readonly dimension: string; readonly priority: number }
export class DecisionQuestionGenerator {
  constructor(private readonly id: () => string) {}
  generate(uncertainty: readonly UncertaintyItem[], intents?: IntentDistribution): readonly DecisionQuestion[] {
    const questions = uncertainty.filter(item => item.uncertainty >= 0.6).map(item => ({
      id: this.id(), dimension: item.dimension, priority: item.uncertainty,
      text: item.dimension === 'background' ? 'Нужно сохранить текущий фон?' : `Уточните желаемый параметр: ${item.dimension}.`,
    }));
    if (intents && intents.intents.length > 1 && intents.intents[0].probability - intents.intents[1].probability < 0.15) {
      questions.push({ id: this.id(), dimension: 'intent', priority: 1, text: `Что важнее: ${intents.intents[0].intent} или ${intents.intents[1].intent}?` });
    }
    return immutable(questions.sort((left, right) => right.priority - left.priority || left.dimension.localeCompare(right.dimension)));
  }
}

export interface CreativeMemoryRecord { readonly scope: Scope; readonly intents: readonly string[]; readonly operations: readonly string[]; readonly quality: number; readonly accepted: boolean }
export interface CreativeCluster { readonly id: string; readonly scope: Scope; readonly signature: string; readonly count: number; readonly acceptance: number; readonly averageQuality: number; readonly typicalOperations: readonly string[] }
export class CreativeMemoryCompression {
  compress(records: readonly CreativeMemoryRecord[]): readonly CreativeCluster[] {
    const groups = new Map<string, CreativeMemoryRecord[]>();
    for (const record of records) {
      const signature = [...record.intents].sort().join('+') || 'unknown';
      const key = `${scopeKey(record.scope)}\u0000${signature}`;
      groups.set(key, [...(groups.get(key) ?? []), record]);
    }
    return immutable([...groups].map(([key, group]) => {
      const signature = key.split('\u0000').at(-1)!;
      return { id: key, scope: { ...group[0].scope }, signature, count: group.length, acceptance: round(group.filter(record => record.accepted).length / group.length), averageQuality: round(average(group.map(record => record.quality))), typicalOperations: [...new Set(group.flatMap(record => record.operations))].sort() };
    }).sort((left, right) => right.count - left.count || left.id.localeCompare(right.id)));
  }
}

export interface TimedStylePoint { readonly scope: Scope; readonly timestamp: number; readonly dimensions: Readonly<Record<string, number>> }
export class DecisionDriftDetector {
  detect(history: readonly TimedStylePoint[], splitTimestamp: number) {
    if (history.length === 0) return immutable({ drift: 0, dimensions: {}, detected: false });
    const scope = history[0].scope;
    if (history.some(item => !sameScope(item.scope, scope))) throw new Error('Drift history must belong to one scope');
    const before = history.filter(item => item.timestamp < splitTimestamp), after = history.filter(item => item.timestamp >= splitTimestamp);
    const keys = new Set(history.flatMap(item => Object.keys(item.dimensions)));
    const dimensions = Object.fromEntries([...keys].sort().map(key => [key, round(average(after.map(item => item.dimensions[key] ?? 0)) - average(before.map(item => item.dimensions[key] ?? 0))) ]));
    const drift = round(Math.sqrt(Object.values(dimensions).reduce((sum, value) => sum + value ** 2, 0)));
    return immutable({ drift, dimensions, detected: before.length > 0 && after.length > 0 && drift >= 0.35 });
  }
}

export interface DecisionConstraint { readonly id: string; readonly kind: 'MINIMIZE' | 'MAXIMIZE' | 'REQUIRE'; readonly target: string; readonly value: number | boolean }
export class DecisionConsistencyAnalyzer {
  analyze(constraints: readonly DecisionConstraint[]) {
    const conflicts: { left: string; right: string; explanation: string }[] = [];
    for (let left = 0; left < constraints.length; left += 1) for (let right = left + 1; right < constraints.length; right += 1) {
      const a = constraints[left], b = constraints[right];
      if (a.target === b.target && a.kind !== b.kind) conflicts.push({ left: a.id, right: b.id, explanation: `Conflicting objectives for ${a.target}` });
      if ((a.target === 'cost' && a.kind === 'MINIMIZE' && b.target === 'aiVariants' && Number(b.value) > 5) || (b.target === 'cost' && b.kind === 'MINIMIZE' && a.target === 'aiVariants' && Number(a.value) > 5)) conflicts.push({ left: a.id, right: b.id, explanation: 'Many AI variants conflict with minimizing cost' });
    }
    return immutable({ consistent: conflicts.length === 0, conflicts });
  }
}

export class CreativeValuePredictor {
  predict(profile: ConfidenceProfile, intents: IntentDistribution, goalCompletion: number): Readonly<Record<string, number>> {
    return immutable(Object.fromEntries(intents.intents.map(intent => [intent.intent, round(100 * clamp(
      intent.probability * 0.35 + profile.overall * 0.35 + goalCompletion * 0.3,
    ))])));
  }
}

export type CreativityLevel = 'CONSERVATIVE' | 'BALANCED' | 'CREATIVE' | 'EXPERIMENTAL' | 'WILD';
export class AdaptiveCreativityLevel {
  select(input: { riskTolerance: number; uncertainty: number; fatigue: number; noveltyPreference: number }): CreativityLevel {
    const score = clamp(input.riskTolerance * 0.35 + input.noveltyPreference * 0.45 - input.uncertainty * 0.1 - input.fatigue * 0.1);
    return score < 0.2 ? 'CONSERVATIVE' : score < 0.4 ? 'BALANCED' : score < 0.6 ? 'CREATIVE' : score < 0.8 ? 'EXPERIMENTAL' : 'WILD';
  }
}

export interface EvolutionNode { readonly id: string; readonly parentId?: string; readonly state: string; readonly explanation: string; readonly timestamp: number }
export class DecisionEvolutionTree {
  constructor(private readonly nodes: readonly EvolutionNode[] = []) {}
  add(node: EvolutionNode): DecisionEvolutionTree {
    if (this.nodes.some(existing => existing.id === node.id)) return this;
    if (node.parentId && !this.nodes.some(existing => existing.id === node.parentId)) throw new Error('Evolution parent does not exist');
    return new DecisionEvolutionTree(immutable([...this.nodes, { ...node }]));
  }
  lineage(id: string): readonly EvolutionNode[] {
    const lineage: EvolutionNode[] = [];
    let current = this.nodes.find(node => node.id === id);
    while (current) { lineage.unshift(current); current = current.parentId ? this.nodes.find(node => node.id === current!.parentId) : undefined; }
    return immutable(lineage);
  }
  snapshot() { return immutable([...this.nodes]); }
}

export interface MetaKnowledgeRule { readonly id: string; readonly scope: Scope; readonly when: string; readonly then: readonly string[]; readonly confidence: number }
export class CreativeMetaKnowledge {
  constructor(private readonly rules: readonly MetaKnowledgeRule[] = []) {}
  add(rule: MetaKnowledgeRule) { return new CreativeMetaKnowledge(immutable([...this.rules.filter(existing => existing.id !== rule.id), { ...rule, then: [...rule.then], confidence: clamp(rule.confidence) }])); }
  infer(scope: Scope, concept: string, depth = 5): readonly string[] {
    const discovered = new Set<string>(), queue = [{ concept, depth: 0 }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= depth) continue;
      for (const rule of this.rules.filter(item => sameScope(item.scope, scope) && item.when === current.concept).sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))) {
        for (const conclusion of rule.then) if (!discovered.has(conclusion)) { discovered.add(conclusion); queue.push({ concept: conclusion, depth: current.depth + 1 }); }
      }
    }
    return immutable([...discovered]);
  }
}

export class DecisionSelfReflection {
  reflect(input: { candidates: readonly DecisionExperiment[]; selectedId: string; actual?: Partial<Metrics> }) {
    const selected = input.candidates.find(candidate => candidate.id === input.selectedId);
    if (!selected) throw new Error('Selected experiment was not found');
    const cheapest = [...input.candidates].sort((a, b) => a.predicted.cost - b.predicted.cost || a.id.localeCompare(b.id))[0];
    const fastest = [...input.candidates].sort((a, b) => a.predicted.latency - b.predicted.latency || a.id.localeCompare(b.id))[0];
    const errors = input.actual ? Object.entries(input.actual).map(([metric, actual]) => ({ metric, error: round(Number(actual) - Number(selected.predicted[metric as keyof Metrics])) })).sort((a, b) => Math.abs(b.error) - Math.abs(a.error)) : [];
    return immutable({ weakestPoint: errors[0]?.metric ?? (selected.predicted.risk > 0.5 ? 'risk' : 'none'), cheaperAlternative: cheapest.id === selected.id ? undefined : cheapest.id, fasterAlternative: fastest.id === selected.id ? undefined : fastest.id, unexpected: errors.filter(error => Math.abs(error.error) >= 0.2), remember: `${selected.strategy}:${selected.score}` });
  }
}

export interface EncodedDecisionFeatures { readonly names: readonly string[]; readonly values: readonly number[] }
export interface DecisionFeatureEncoder {
  encode(state: CreativeWorldStateSnapshot, goals: CreativeGoalNode, context: Readonly<Record<string, number>>): EncodedDecisionFeatures;
}
export class HeuristicDecisionFeatureEncoder implements DecisionFeatureEncoder {
  encode(state: CreativeWorldStateSnapshot, goals: CreativeGoalNode, context: Readonly<Record<string, number>>): EncodedDecisionFeatures {
    const features: Record<string, number> = { ...context, goalWeight: goals.weight, worldCompleteness: Object.keys(state.attributes).length / 11 };
    for (const [dimension, attribute] of Object.entries(state.attributes)) if (typeof attribute.value === 'number') features[`world.${dimension}`] = attribute.value * attribute.confidence;
    const names = Object.keys(features).sort();
    return immutable({ names, values: names.map(name => round(features[name])) });
  }
}

export interface DecisionLatentVector { readonly dimensions: readonly number[]; readonly version: string }
export interface DecisionLatentSpace { project(features: EncodedDecisionFeatures): DecisionLatentVector; distance(left: DecisionLatentVector, right: DecisionLatentVector): number }
export class IdentityDecisionLatentSpace implements DecisionLatentSpace {
  project(features: EncodedDecisionFeatures) { return immutable({ dimensions: [...features.values], version: 'identity-v1' }); }
  distance(left: DecisionLatentVector, right: DecisionLatentVector) { const length = Math.max(left.dimensions.length, right.dimensions.length); return round(Math.sqrt(Array.from({ length }, (_, index) => ((left.dimensions[index] ?? 0) - (right.dimensions[index] ?? 0)) ** 2).reduce((a, b) => a + b, 0))); }
}

export interface DecisionInference { readonly metrics: Metrics; readonly explanation: Readonly<Record<string, unknown>> }
export interface DecisionInferenceEngine { infer(features: EncodedDecisionFeatures): DecisionInference }
export class HeuristicDecisionInferenceEngine implements DecisionInferenceEngine {
  constructor(private readonly model: DecisionModel) {}
  infer(features: EncodedDecisionFeatures): DecisionInference {
    const record = Object.fromEntries(features.names.map((name, index) => [name, features.values[index]]));
    return immutable({ metrics: this.model.predict(record), explanation: this.model.explain(record) });
  }
}

export interface DecisionTrainer { train(model: DecisionModel, samples: readonly ModelSample[]): DecisionModel }
export class DeterministicDecisionTrainer implements DecisionTrainer { train(model: DecisionModel, samples: readonly ModelSample[]) { return model.train([...samples].sort((a, b) => a.id.localeCompare(b.id))); } }

export interface DecisionCheckpoint { readonly id: string; readonly modelVersion: string; readonly createdAt: number; readonly schemaVersion: number; readonly compatibleSchemas: readonly number[]; readonly metadata: Readonly<Record<string, string>> }
export class DecisionCheckpointFactory {
  constructor(private readonly dependencies: Pick<DeterministicDependencies, 'id' | 'clock'>) {}
  create(model: DecisionModel, schemaVersion: number, metadata: Readonly<Record<string, string>> = {}): DecisionCheckpoint { return immutable({ id: this.dependencies.id(), modelVersion: model.version(), createdAt: this.dependencies.clock(), schemaVersion, compatibleSchemas: [schemaVersion], metadata: { ...metadata } }); }
  compatible(checkpoint: DecisionCheckpoint, schemaVersion: number) { return checkpoint.compatibleSchemas.includes(schemaVersion); }
}

export interface BenchmarkScenario { readonly id: string; readonly features: Readonly<Record<string, number>>; readonly expected: Partial<Metrics>; readonly tolerance: number }
export class DecisionEvaluationBenchmark {
  evaluate(model: DecisionModel, scenarios: readonly BenchmarkScenario[]) {
    const results = [...scenarios].sort((a, b) => a.id.localeCompare(b.id)).map(scenario => {
      const predicted = model.predict(scenario.features);
      const errors = Object.fromEntries(Object.entries(scenario.expected).map(([metric, expected]) => [metric, round(Math.abs(Number(expected) - Number(predicted[metric as keyof Metrics])))]));
      return { id: scenario.id, errors, passed: Object.values(errors).every(error => error <= scenario.tolerance) };
    });
    return immutable({ results, passRate: round(results.filter(result => result.passed).length / Math.max(1, results.length)) });
  }
}

export class DecisionModelRegistry {
  constructor(private readonly models: Readonly<Record<string, DecisionModel>> = {}, readonly active?: string) {}
  register(name: string, model: DecisionModel) { return new DecisionModelRegistry(immutable({ ...this.models, [name]: model }), this.active ?? name); }
  activate(name: string) { if (!this.models[name]) throw new Error(`Decision model "${name}" is not registered`); return new DecisionModelRegistry(this.models, name); }
  current(): DecisionModel { if (!this.active || !this.models[this.active]) throw new Error('No active decision model'); return this.models[this.active]; }
  list() { return immutable(Object.keys(this.models).sort()); }
}
