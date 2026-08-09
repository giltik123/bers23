/**
 * Creative Decision OS intelligence primitives.
 *
 * This package deliberately has no infrastructure imports.  Persistence, clocks and
 * identifiers are supplied at the boundary, making every algorithm deterministic and
 * safe to run before an execution pipeline exists.
 */

export type Scope = Readonly<{ tenantId: string; projectId: string; userId: string }>;
export type Metrics = Readonly<{ quality: number; cost: number; latency: number; risk: number; probability: number; satisfaction: number; creativity: number }>;

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const round = (value: number, digits = 6) => Number(value.toFixed(digits));
const mean = (values: readonly number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const keyOf = (scope: Scope) => `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;

export function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as object)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

export interface GraphNode { id: string; kind: string; label?: string; scope: Scope; data?: Readonly<Record<string, unknown>> }
export interface GraphEdge { from: string; to: string; scope: Scope; weight: number; frequency: number; success: number; cost: number; satisfaction: number; confidence: number; quality: number }
export interface GraphSnapshot { nodes: readonly GraphNode[]; edges: readonly GraphEdge[] }

/** Persistent-style scoped decision graph: mutators return a new graph. */
export class DecisionGraphMemory {
  readonly snapshot: GraphSnapshot;
  constructor(snapshot: GraphSnapshot = { nodes: [], edges: [] }) {
    this.snapshot = immutable({ nodes: [...snapshot.nodes], edges: [...snapshot.edges] });
  }
  add(node: GraphNode): DecisionGraphMemory {
    const existing = this.snapshot.nodes.find(n => n.id === node.id);
    if (existing && keyOf(existing.scope) !== keyOf(node.scope)) throw new Error(`Graph node id "${node.id}" already belongs to another scope`);
    if (existing) return this;
    return new DecisionGraphMemory({ ...this.snapshot, nodes: [...this.snapshot.nodes, immutable({ ...node, data: { ...(node.data ?? {}) } })] });
  }
  connect(from: string, to: string, metrics: Partial<Omit<GraphEdge, 'from' | 'to'>> = {}): DecisionGraphMemory {
    const source = this.snapshot.nodes.find(node => node.id === from), target = this.snapshot.nodes.find(node => node.id === to);
    if (!source || !target) throw new Error('Both graph nodes must exist before they can be connected');
    if (keyOf(source.scope) !== keyOf(target.scope)) throw new Error('Cross-scope graph connections are forbidden');
    const edge: GraphEdge = immutable({ from, to, scope: source.scope, weight: metrics.weight ?? 1, frequency: metrics.frequency ?? 1, success: clamp(metrics.success ?? 0), cost: Math.max(0, metrics.cost ?? 0), satisfaction: clamp(metrics.satisfaction ?? 0), confidence: clamp(metrics.confidence ?? .5), quality: clamp(metrics.quality ?? 0) });
    const old = this.snapshot.edges.find(e => e.from === from && e.to === to);
    const edges = this.snapshot.edges.filter(e => e !== old);
    if (old) {
      const f = old.frequency + edge.frequency;
      const blend = (a: number, b: number) => round((a * old.frequency + b * edge.frequency) / f);
      edges.push(immutable({ ...edge, weight: old.weight + edge.weight, frequency: f, success: blend(old.success, edge.success), cost: blend(old.cost, edge.cost), satisfaction: blend(old.satisfaction, edge.satisfaction), confidence: blend(old.confidence, edge.confidence), quality: blend(old.quality, edge.quality) }));
    } else edges.push(edge);
    return new DecisionGraphMemory({ nodes: this.snapshot.nodes, edges });
  }
  private allowed(scope?: Scope) { return new Set(this.snapshot.nodes.filter(n => !scope || keyOf(n.scope) === keyOf(scope)).map(n => n.id)); }
  findRelated(id: string, depth = 1, scope?: Scope): readonly GraphNode[] {
    const allowed = this.allowed(scope); const found = new Set<string>(); let frontier = [id];
    for (let i = 0; i < depth; i++) { const next: string[] = []; for (const edge of this.snapshot.edges) if (frontier.includes(edge.from) && allowed.has(edge.to) && !found.has(edge.to)) { found.add(edge.to); next.push(edge.to); } frontier = next; }
    return immutable(this.snapshot.nodes.filter(n => found.has(n.id)));
  }
  shortestPath(from: string, to: string, scope?: Scope): readonly string[] {
    const allowed = this.allowed(scope); const queue: string[][] = [[from]]; const seen = new Set([from]);
    while (queue.length) { const path = queue.shift()!; const last = path[path.length - 1]; if (last === to) return immutable(path); for (const e of this.snapshot.edges) if (e.from === last && allowed.has(e.to) && !seen.has(e.to)) { seen.add(e.to); queue.push([...path, e.to]); } }
    return immutable([]);
  }
  importance(id: string): number { return round(this.snapshot.edges.filter(e => e.from === id || e.to === id).reduce((s, e) => s + e.weight * e.confidence * Math.max(1, e.frequency), 0)); }
  centralNodes(limit = 10, scope?: Scope): readonly GraphNode[] { const allowed = this.allowed(scope); return immutable(this.snapshot.nodes.filter(n => allowed.has(n.id)).sort((a, b) => this.importance(b.id) - this.importance(a.id) || a.id.localeCompare(b.id)).slice(0, limit)); }
  communityDetection(scope?: Scope): readonly (readonly string[])[] {
    const allowed = this.allowed(scope), unseen = new Set(allowed), groups: string[][] = [];
    while (unseen.size) { const first = [...unseen].sort()[0], group: string[] = [], stack = [first]; unseen.delete(first); while (stack.length) { const id = stack.pop()!; group.push(id); for (const e of this.snapshot.edges) { const peer = e.from === id ? e.to : e.to === id ? e.from : ''; if (peer && unseen.has(peer)) { unseen.delete(peer); stack.push(peer); } } } groups.push(group.sort()); }
    return immutable(groups.sort((a, b) => a[0].localeCompare(b[0])));
  }
  exportSubgraph(ids: readonly string[], scope?: Scope): GraphSnapshot { const allowed = this.allowed(scope), selected = new Set(ids.filter(id => allowed.has(id))); return immutable({ nodes: this.snapshot.nodes.filter(n => selected.has(n.id)), edges: this.snapshot.edges.filter(e => selected.has(e.from) && selected.has(e.to)) }); }
}

export interface DecisionObservation { scope: Scope; operations: readonly string[]; accepted?: boolean; undo?: boolean; quality?: number; cost?: number; latency?: number; timestamp?: number }
export interface DecisionPattern { id: string; scope: Scope; operations: readonly string[]; frequency: number; success: number; failure: number; acceptance: number; undo: number; averageQuality: number; averageCost: number; averageLatency: number; strength: number; lifetime: number; stability: number; confidence: number }
export class DecisionPatternDiscovery {
  discover(items: readonly DecisionObservation[], now = 0, minimumFrequency = 2): readonly DecisionPattern[] {
    const groups = new Map<string, DecisionObservation[]>(); for (const item of items) { const id = `${keyOf(item.scope)}\u0000${item.operations.join('>')}`; groups.set(id, [...(groups.get(id) ?? []), item]); }
    return immutable([...groups].filter(([, xs]) => xs.length >= minimumFrequency).map(([, xs]) => { const id = xs[0].operations.join('>'), accepted = xs.filter(x => x.accepted).length, undo = xs.filter(x => x.undo).length, times = xs.map(x => x.timestamp ?? now); const quality = mean(xs.map(x => x.quality ?? 0)); const stability = clamp(1 - Math.sqrt(mean(xs.map(x => ((x.quality ?? 0) - quality) ** 2)))); return { id, scope: { ...xs[0].scope }, operations: [...xs[0].operations], frequency: xs.length, success: accepted, failure: xs.length - accepted, acceptance: round(accepted / xs.length), undo, averageQuality: round(quality), averageCost: round(mean(xs.map(x => x.cost ?? 0))), averageLatency: round(mean(xs.map(x => x.latency ?? 0))), strength: round(Math.log2(xs.length + 1) * (accepted / xs.length) * stability), lifetime: Math.max(...times) - Math.min(...times), stability: round(stability), confidence: round(xs.length / (xs.length + 5)) }; }).sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id)));
  }
}

export interface Archetype { id: string; scope: Scope; preferences: readonly string[]; goals: readonly string[]; quality: number; risk: number; budget: number; typicalOperations: readonly string[]; confidence: number; members: number }
export class DecisionArchetypeEngine {
  create(observations: readonly (DecisionObservation & { preferences?: readonly string[]; goals?: readonly string[]; risk?: number; budget?: number })[]): readonly Archetype[] {
    const groups = new Map<string, typeof observations>(); for (const o of observations) { const identity = [...(o.goals ?? []), '|', ...(o.preferences ?? [])].join(':') || 'emergent', id = `${keyOf(o.scope)}\u0000${identity}`; groups.set(id, [...(groups.get(id) ?? []), o]); }
    return immutable([...groups].map(([, xs]) => ({ id: [...(xs[0].goals ?? []), '|', ...(xs[0].preferences ?? [])].join(':') || 'emergent', scope: { ...xs[0].scope }, preferences: [...new Set(xs.flatMap(x => x.preferences ?? []))].sort(), goals: [...new Set(xs.flatMap(x => x.goals ?? []))].sort(), quality: round(mean(xs.map(x => x.quality ?? 0))), risk: round(mean(xs.map(x => x.risk ?? 0))), budget: round(mean(xs.map(x => x.budget ?? x.cost ?? 0))), typicalOperations: [...new Set(xs.flatMap(x => x.operations))].sort(), confidence: round(xs.length / (xs.length + 3)), members: xs.length })));
  }
  merge(a: Archetype, b: Archetype): Archetype { if (keyOf(a.scope) !== keyOf(b.scope)) throw new Error('Cross-scope archetype merges are forbidden'); const total = a.members + b.members, blend = (x: number, y: number) => round((x * a.members + y * b.members) / total); return immutable({ id: [a.id, b.id].sort().join('+'), scope: a.scope, preferences: [...new Set([...a.preferences, ...b.preferences])].sort(), goals: [...new Set([...a.goals, ...b.goals])].sort(), quality: blend(a.quality, b.quality), risk: blend(a.risk, b.risk), budget: blend(a.budget, b.budget), typicalOperations: [...new Set([...a.typicalOperations, ...b.typicalOperations])].sort(), confidence: blend(a.confidence, b.confidence), members: total }); }
}

export interface CreativeDNA { generation: number; style: Readonly<Record<string, number>>; risk: number; creativity: number; aiTrust: number; automation: number; confidence: number }
export class CreativeDNAEngine {
  constructor(readonly learningRate = .08) {}
  initial(style: Record<string, number> = {}): CreativeDNA { return immutable({ generation: 1, style: Object.fromEntries(Object.entries(style).map(([k, v]) => [k, clamp(v)])), risk: .5, creativity: .5, aiTrust: .5, automation: .5, confidence: 0 }); }
  evolve(dna: CreativeDNA, signal: Partial<Omit<CreativeDNA, 'generation' | 'style'>> & { style?: Record<string, number> }): CreativeDNA { const learn = (old: number, value?: number) => value === undefined ? old : round(old + this.learningRate * (clamp(value) - old)); const keys = new Set([...Object.keys(dna.style), ...Object.keys(signal.style ?? {})]); return immutable({ generation: dna.generation + 1, style: Object.fromEntries([...keys].sort().map(k => [k, learn(dna.style[k] ?? .5, signal.style?.[k])])), risk: learn(dna.risk, signal.risk), creativity: learn(dna.creativity, signal.creativity), aiTrust: learn(dna.aiTrust, signal.aiTrust), automation: learn(dna.automation, signal.automation), confidence: learn(dna.confidence, signal.confidence ?? Math.min(1, dna.confidence + .1)) }); }
}

export interface SimulationCandidate extends Metrics { id: string; operations: readonly string[]; utility: number }
export class DecisionSimulator {
  constructor(private readonly scorer?: (operations: readonly string[], index: number) => Partial<Metrics>) {}
  simulate(operations: readonly string[], count = 10): readonly SimulationCandidate[] { const size = Math.max(10, count), candidates = Array.from({ length: size }, (_, i) => { const selected = operations.filter((_, j) => ((i + 1) & (1 << (j % 8))) !== 0); const fallback = selected.length ? selected : operations.slice(0, 1); const base: Metrics = { quality: clamp(.55 + fallback.length * .04 - i * .002), cost: round(fallback.length * 5), latency: fallback.length * 100, risk: clamp(.1 + fallback.length * .035), probability: clamp(.9 - i * .02), satisfaction: clamp(.5 + fallback.length * .04), creativity: clamp(.35 + (i % 5) * .1) }; const m = { ...base, ...(this.scorer?.(fallback, i) ?? {}) }; return { id: `future-${String(i + 1).padStart(2, '0')}`, operations: [...fallback], ...m, utility: round(m.quality * m.probability + m.satisfaction + m.creativity * .25 - m.risk - m.cost / 100 - m.latency / 10000) }; }); return immutable(candidates.sort((a, b) => b.utility - a.utility || a.id.localeCompare(b.id))); }
}

export type EconomicRecommendation = 'STOP' | 'CONTINUE' | 'LOCAL_ONLY' | 'AI_JUSTIFIED' | 'AI_WASTE';
export class DecisionEconomics {
  evaluate(input: { baselineQuality: number; expectedQuality: number; cost: number; credits?: number; value?: number; probability?: number; alternativeValue?: number; isAI?: boolean }) { const gain = input.expectedQuality - input.baselineQuality, value = input.value ?? input.expectedQuality * 100, expectedValue = value * (input.probability ?? 1) - input.cost, roi = input.cost ? (expectedValue - input.cost) / input.cost : expectedValue; let recommendation: EconomicRecommendation = gain <= 0 ? 'STOP' : input.isAI ? (gain / Math.max(1, input.cost) >= .01 ? 'AI_JUSTIFIED' : 'AI_WASTE') : input.cost === 0 ? 'LOCAL_ONLY' : 'CONTINUE'; return immutable({ roi: round(roi), qualityGain: round(gain), costEfficiency: round(gain / Math.max(1, input.cost)), creditEfficiency: round(gain / Math.max(1, input.credits ?? input.cost)), marginalQuality: round(gain), marginalCost: input.cost, expectedValue: round(expectedValue), opportunityCost: round(Math.max(0, (input.alternativeValue ?? 0) - expectedValue)), recommendation }); }
}

export interface LearningWeights { prediction: number; confidence: number; utility: number; quality: number; satisfaction: number }
export class MetaLearningEngine {
  adapt(weights: LearningWeights, prediction: Partial<Metrics & { utility: number }>, reality: Partial<Metrics & { utility: number }>, rate = .1) { const error = (k: keyof LearningWeights, metric: string = k) => round((Number((reality as any)[metric] ?? 0) - Number((prediction as any)[metric] ?? 0))); const errors = { predictionError: error('prediction', 'probability'), confidenceError: error('confidence', 'probability'), utilityError: error('utility'), qualityError: error('quality'), satisfactionError: error('satisfaction') }; const errorFor = (key: string) => Math.abs((errors as any)[`${key}Error`] ?? errors.predictionError); const updated = Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, round(clamp(value * (1 - rate * errorFor(key)), 0, 10))])) as unknown as LearningWeights; return immutable({ errors, weights: updated, thresholds: { confidence: round(clamp(.5 + errors.confidenceError * rate)), quality: round(clamp(.5 + errors.qualityError * rate)) } }); }
}

export interface LearningEvent { timestamp: number; accepted?: boolean; rejected?: boolean; undo?: boolean; redo?: boolean; retry?: boolean; manualCorrection?: boolean; cancel?: boolean; repeatedEdits?: number }
export class LongTermLearning {
  evaluate(events: readonly LearningEvent[], now: number, halfLife = 365 * 86400000) { if (halfLife <= 0) throw new RangeError('halfLife must be positive'); const weighted = events.map(e => ({ e, w: 2 ** (-(Math.max(0, now - e.timestamp) / halfLife)) })); const total = weighted.reduce((s, x) => s + x.w, 0); const positive = weighted.reduce((s, { e, w }) => s + w * ((e.accepted ? 1 : 0) + (e.redo ? .3 : 0) + (e.manualCorrection ? .2 : 0)), 0); const negative = weighted.reduce((s, { e, w }) => s + w * ((e.rejected ? 1 : 0) + (e.undo ? .8 : 0) + (e.cancel ? .5 : 0) + (e.retry ? .25 : 0) + Math.min(1, (e.repeatedEdits ?? 0) * .1)), 0); return immutable({ experience: round(total), knowledge: round(positive / Math.max(1, total)), maturity: round(1 - Math.exp(-total / 100)), reliability: round(clamp(positive / Math.max(1, positive + negative))), expertise: round(clamp(Math.log2(total + 1) / 10)), forgotten: round(events.length - total) }); }
}

export class DecisionFatigueModel {
  evaluate(input: { choices: number; confirmations: number; creativeBranches: number; decisions: number }) { const choiceOverload = clamp((input.choices - 5) / 20), confirmationOverload = clamp(input.confirmations / 10), creativeOverload = clamp(input.creativeBranches / 15), decisionOverload = clamp(input.decisions / 30), score = round(mean([choiceOverload, confirmationOverload, creativeOverload, decisionOverload])); const recommendation = score >= .75 ? 'Automatic mode' : score >= .5 ? 'One recommendation' : score >= .3 ? 'Preset' : 'Break complex workflow'; return immutable({ choiceOverload, confirmationOverload, creativeOverload, decisionOverload, score, recommendation }); }
}
export class CreativeSatisfactionModel {
  evaluate(input: { technicalQuality: number; creativeQuality: number; goalCompletion: number; userSatisfaction: number; confidence: number; expectedQuality: number }) { const confidenceSatisfaction = clamp(1 - Math.abs(input.confidence - input.userSatisfaction)), expectationGap = round(input.expectedQuality - input.userSatisfaction); return immutable({ ...input, confidenceSatisfaction: round(confidenceSatisfaction), expectationGap, overall: round(mean([input.technicalQuality, input.creativeQuality, input.goalCompletion, input.userSatisfaction, confidenceSatisfaction])) }); }
}

export class ReversePlanningEngine {
  plan(input: { desiredResult: string; targetStyle: string; requiredQuality: number; availableOperations: readonly string[] }) { const operations = [...input.availableOperations].sort((a, b) => (b.includes(input.targetStyle.toLowerCase()) ? 1 : 0) - (a.includes(input.targetStyle.toLowerCase()) ? 1 : 0) || a.localeCompare(b)); return immutable({ desiredResult: input.desiredResult, targetStyle: input.targetStyle, requiredQuality: clamp(input.requiredQuality), requiredOperations: operations, executionPlan: operations.map((operation, index) => ({ step: index + 1, operation })) }); }
}

export interface ReasoningBranch { id: string; alternative: string; confidence: number; utility: number; explanation: string; pruned: boolean; pruningReason?: string }
export class CreativeReasoningTree {
  build(prompt: string, goals: readonly string[], alternatives: readonly { id?: string; value: string; confidence: number; utility: number; explanation?: string }[], threshold = .3) { const branches: ReasoningBranch[] = alternatives.map((a, i) => ({ id: a.id ?? `branch-${i + 1}`, alternative: a.value, confidence: clamp(a.confidence), utility: a.utility, explanation: a.explanation ?? `Supports ${goals.join(', ')}`, pruned: a.confidence < threshold || a.utility < 0, pruningReason: a.confidence < threshold ? 'low confidence' : a.utility < 0 ? 'negative utility' : undefined })); const selected = branches.filter(b => !b.pruned).sort((a, b) => b.utility - a.utility || b.confidence - a.confidence || a.id.localeCompare(b.id))[0]; return immutable({ prompt, goals: [...goals], stages: ['Prompt', 'Goals', 'Alternatives', 'Expansion', 'Pruning', 'Comparison', 'Selection'], branches, selected }); }
}
export class DecisionSelfCritic {
  analyze(decision: { quality?: number; risk?: number; cost?: number; operations?: readonly string[] }, alternatives: readonly unknown[] = []) { const quality = decision.quality ?? 0, risk = decision.risk ?? 0; const strengths = [quality >= .7 && 'high quality', decision.cost === 0 && 'zero cost'].filter(Boolean) as string[]; const weaknesses = [quality < .6 && 'quality uncertainty', !decision.operations?.length && 'no operations selected'].filter(Boolean) as string[]; return immutable({ strengths, weaknesses, risks: risk > .5 ? ['elevated risk'] : [], alternatives: [...alternatives], missedOpportunities: alternatives.length ? ['unselected alternatives'] : [], improvementSuggestions: weaknesses.length ? ['simulate an additional option'] : ['monitor outcome'], decision: immutable({ ...decision }) }); }
}

export interface CreativeStrategy { id: string; operations: readonly string[]; goals: readonly string[]; quality: number; cost: number; risk: number; recommendedPersonas: readonly string[] }
const STRATEGIES = ['Luxury', 'Minimal', 'Professional', 'Budget', 'Catalog', 'Portrait', 'Fashion', 'Studio', 'Marketing', 'Creative', 'Experimental'].map((id, i): CreativeStrategy => immutable({ id, operations: [id.toLowerCase().replace(' ', '_')], goals: [i < 3 ? 'quality' : i === 3 ? 'cost' : 'creative-result'], quality: round(.9 - i * .025), cost: Math.max(0, 30 - i * 2), risk: round(.1 + i * .06), recommendedPersonas: [`${id} Creator`] }));
export class CreativeStrategyLibrary { constructor(private readonly strategies: readonly CreativeStrategy[] = STRATEGIES) {} list() { return immutable([...this.strategies]); } get(id: string) { return this.strategies.find(s => s.id.toLowerCase() === id.toLowerCase()); } recommend(goal: string, persona?: string) { return immutable(this.strategies.filter(s => s.goals.includes(goal) || (persona && s.recommendedPersonas.includes(persona))).sort((a, b) => b.quality - a.quality || a.id.localeCompare(b.id))); } add(strategy: CreativeStrategy) { return new CreativeStrategyLibrary([...this.strategies.filter(s => s.id !== strategy.id), immutable({ ...strategy })]); } }

export interface ModelSample { id: string; features: Readonly<Record<string, number>>; outcome: Partial<Metrics>; accepted?: boolean }
export interface DecisionModel { train(samples: readonly ModelSample[]): DecisionModel; evaluate(sample: ModelSample): Readonly<Record<string, number>>; rank(samples: readonly ModelSample[]): readonly ModelSample[]; predict(features: Readonly<Record<string, number>>): Metrics; simulate(features: Readonly<Record<string, number>>, count?: number): readonly SimulationCandidate[]; adapt(prediction: Partial<Metrics>, reality: Partial<Metrics>): DecisionModel; exportDataset(): string; importDataset(value: string): DecisionModel; calibrate(): DecisionModel; explain(features: Readonly<Record<string, number>>): Readonly<Record<string, unknown>>; version(): string }
export class HeuristicDecisionModel implements DecisionModel {
  constructor(private readonly samples: readonly ModelSample[] = [], private readonly weights: Readonly<Record<string, number>> = {}, private readonly revision = 1) {}
  train(samples: readonly ModelSample[]) { const all = [...this.samples, ...samples].map(s => immutable({ ...s, features: { ...s.features }, outcome: { ...s.outcome } })); const names = [...new Set(all.flatMap(s => Object.keys(s.features)))]; const weights = Object.fromEntries(names.map(n => [n, round(mean(all.map(s => s.features[n] ?? 0)))])); return new HeuristicDecisionModel(immutable(all), immutable(weights), this.revision + 1); }
  predict(features: Readonly<Record<string, number>>): Metrics { const score = clamp(mean(Object.entries(features).map(([k, v]) => v * (this.weights[k] ?? 1)))); return immutable({ quality: score, cost: round((1 - score) * 20), latency: round((1 - score) * 1000), risk: round(1 - score), probability: round(.5 + score / 2), satisfaction: score, creativity: clamp(features.creativity ?? score) }); }
  evaluate(sample: ModelSample) { const p = this.predict(sample.features); return immutable({ qualityError: round((sample.outcome.quality ?? p.quality) - p.quality), utility: round(p.quality + p.satisfaction - p.risk - p.cost / 100) }); }
  rank(samples: readonly ModelSample[]) { return immutable([...samples].sort((a, b) => (this.evaluate(b).utility - this.evaluate(a).utility) || a.id.localeCompare(b.id))); }
  simulate(features: Readonly<Record<string, number>>, count = 10) { const p = this.predict(features); return new DecisionSimulator((_, i) => ({ ...p, creativity: clamp(p.creativity + i * .01) })).simulate(Object.keys(features), count); }
  adapt(prediction: Partial<Metrics>, reality: Partial<Metrics>) { const delta = (reality.quality ?? 0) - (prediction.quality ?? 0); return new HeuristicDecisionModel(this.samples, immutable(Object.fromEntries(Object.entries(this.weights).map(([k, v]) => [k, round(v + delta * .05)]))), this.revision + 1); }
  exportDataset() { return JSON.stringify([...this.samples].sort((a, b) => a.id.localeCompare(b.id))); }
  importDataset(value: string) { const parsed = JSON.parse(value); if (!Array.isArray(parsed)) throw new TypeError('Decision dataset must be an array'); return new HeuristicDecisionModel().train(parsed); }
  calibrate() { return new HeuristicDecisionModel(this.samples, this.weights, this.revision + 1); }
  explain(features: Readonly<Record<string, number>>) { return immutable({ model: 'heuristic', version: this.version(), contributions: Object.fromEntries(Object.entries(features).sort().map(([k, v]) => [k, round(v * (this.weights[k] ?? 1))])), prediction: this.predict(features) }); }
  version() { return `heuristic-v${this.revision}`; }
}

export class CreativeWorldModel {
  constructor(private readonly knowledge: Readonly<Record<string, readonly string[]>> = {}) {}
  update(concept: string, relations: readonly string[]) { return new CreativeWorldModel(immutable({ ...this.knowledge, [concept]: [...new Set([...(this.knowledge[concept] ?? []), ...relations])].sort() })); }
  query(concept: string) { return immutable([...(this.knowledge[concept] ?? [])]); }
  infer(concept: string, depth = 3) { const result = new Set<string>(), queue = [{ id: concept, depth: 0 }]; while (queue.length) { const x = queue.shift()!; if (x.depth >= depth) continue; for (const next of this.knowledge[x.id] ?? []) if (!result.has(next)) { result.add(next); queue.push({ id: next, depth: x.depth + 1 }); } } return immutable([...result]); }
  export() { return immutable({ ...this.knowledge }); }
}

export type StylePoint = Readonly<Record<string, number>>;
export class StyleSpace {
  normalize(point: StylePoint): StylePoint { return immutable(Object.fromEntries(Object.entries(point).sort().map(([k, v]) => [k, clamp(v)]))); }
  distance(a: StylePoint, b: StylePoint) { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); return round(Math.sqrt([...keys].reduce((s, k) => s + ((a[k] ?? 0) - (b[k] ?? 0)) ** 2, 0))); }
  interpolate(a: StylePoint, b: StylePoint, amount = .5) { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); return this.normalize(Object.fromEntries([...keys].map(k => [k, (a[k] ?? 0) * (1 - amount) + (b[k] ?? 0) * amount]))); }
  nearest(point: StylePoint, candidates: Readonly<Record<string, StylePoint>>, limit = 1) { return immutable(Object.entries(candidates).map(([id, style]) => ({ id, distance: this.distance(point, style) })).sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)).slice(0, limit)); }
}

export type ProvenanceSource = 'Preference' | 'Knowledge' | 'History' | 'Pattern' | 'Rules' | 'Simulation';
export class DecisionProvenance {
  calculate(raw: Partial<Record<ProvenanceSource, number>>) { const sources: ProvenanceSource[] = ['Preference', 'Knowledge', 'History', 'Pattern', 'Rules', 'Simulation']; const total = sources.reduce((s, k) => s + Math.max(0, raw[k] ?? 0), 0); return immutable(Object.fromEntries(sources.map(k => [k, total ? round(Math.max(0, raw[k] ?? 0) / total) : 0])) as Record<ProvenanceSource, number>); }
}
export class CreativeDiscoveryEngine {
  discover(candidates: readonly (SimulationCandidate & { style?: StylePoint })[], limit = 5) { return immutable(candidates.map((c, i) => { const peers = candidates.filter(x => x !== c); const diversity = peers.length && c.style ? mean(peers.map(p => p.style ? new StyleSpace().distance(c.style!, p.style) : 0)) : c.creativity; const novelty = clamp((i + 1) / candidates.length); const unexpected = clamp(c.creativity * (1 - c.probability)); return { ...c, novel: round(novelty), diverse: round(diversity), unexpected: round(unexpected), discoveryScore: round(novelty * .3 + diversity * .3 + unexpected * .2 + c.creativity * .2) }; }).sort((a, b) => b.discoveryScore - a.discoveryScore || a.id.localeCompare(b.id)).slice(0, limit)); }
}

export class UnifiedIntelligenceDebuggerV4 {
  trace(values: Partial<Record<string, unknown>>) { const stages = ['Prompt', 'Intent', 'Goals', 'Knowledge', 'World Model', 'Graph Memory', 'Patterns', 'Archetype', 'Creative DNA', 'Reasoning Tree', 'Strategies', 'Simulation', 'Pareto', 'Tournament', 'Decision', 'Confidence', 'Economics', 'Risk', 'Fatigue', 'Satisfaction', 'Meta Learning', 'Decision Model', 'Learning Statistics']; return immutable({ version: 4, stages: stages.map(name => ({ name, value: values[name] ?? null })), text: stages.map(name => `${name}: ${JSON.stringify(values[name] ?? null)}`).join('\n') }); }
}

/** Dependency-injected facade. It does not import or call providers, UI, persistence or execution. */
export class CreativeDecisionIntelligenceCore {
  constructor(readonly dependencies: Readonly<{ model: DecisionModel; clock: () => number; id: () => string; simulator?: DecisionSimulator }>) { immutable(dependencies); }
  decide(scope: Scope, features: StylePoint) { const prediction = this.dependencies.model.predict(features), simulations = (this.dependencies.simulator ?? new DecisionSimulator()).simulate(Object.keys(features), 10), decision = immutable({ id: this.dependencies.id(), scope: immutable({ ...scope }), createdAt: this.dependencies.clock(), prediction, simulations, provenance: new DecisionProvenance().calculate({ Knowledge: .3, Rules: .2, Simulation: .5 }) }); return decision; }
}

export * from './cognitive';
export * from './learning';
export * from "./types";
export * from "./GoalEngine";
export * from "./ConstraintSolver";
export * from "./UtilityOptimizer";
export * from "./DecisionMemory";
export * from "./DecisionReplay";
export * from "./ConfidenceEstimator";
export * from "./DecisionUncertainty";
export * from "./RiskAnalyzer";
export * from "./AdaptivePersonas";
export * from "./MetaDecisionEngine";
export * from "./DecisionEvaluator";
export * from "./DecisionTournament";
export * from "./ExplainabilityTree";
export * from "./DecisionEvolution";
export * from "./CreativeDecisionCore";
