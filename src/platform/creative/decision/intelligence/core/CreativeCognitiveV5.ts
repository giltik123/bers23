import { clamp, immutable } from "./immutable";

export interface CognitiveScope { readonly userId: string; readonly tenantId: string; readonly projectId: string }
export interface CognitiveDependencies { readonly createId: () => string; readonly now: () => number }
const keyOf = (scope: CognitiveScope) => `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;
const sameScope = (a: CognitiveScope, b: CognitiveScope) => keyOf(a) === keyOf(b);
const copy = <T>(value: T): T => structuredClone(value);
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export interface CausalObservation { readonly cause: string; readonly effect: string; readonly supported: boolean; readonly strength?: number }
export interface CausalLink { readonly cause: string; readonly effect: string; readonly causalStrength: number; readonly support: number; readonly confidence: number; readonly counterEvidence: number; readonly lastUpdated: number }
export interface CreativeCausalGraph extends CognitiveScope { readonly links: readonly CausalLink[] }

export class CreativeCausalLearningEngine {
  private graphs: ReadonlyMap<string, readonly CausalLink[]> = new Map();
  constructor(private readonly dependencies: CognitiveDependencies) {}
  learn(scope: CognitiveScope, observations: readonly CausalObservation[]): CreativeCausalGraph {
    const links = [...(this.graphs.get(keyOf(scope)) ?? [])].map(copy);
    [...observations].sort((a, b) => `${a.cause}\u0000${a.effect}`.localeCompare(`${b.cause}\u0000${b.effect}`)).forEach((observation) => {
      const index = links.findIndex(({ cause, effect }) => cause === observation.cause && effect === observation.effect);
      const previous = links[index]; const support = (previous?.support ?? 0) + (observation.supported ? 1 : 0);
      const counterEvidence = (previous?.counterEvidence ?? 0) + (observation.supported ? 0 : 1); const evidence = support + counterEvidence;
      const measured = clamp(observation.strength ?? (observation.supported ? 1 : 0));
      const causalStrength = evidence ? ((previous?.causalStrength ?? 0) * (evidence - 1) + measured) / evidence : measured;
      const link = immutable({ cause: observation.cause, effect: observation.effect, causalStrength, support,
        confidence: clamp(evidence / (evidence + 2) * (1 - counterEvidence / Math.max(1, evidence))), counterEvidence, lastUpdated: this.dependencies.now() });
      if (index < 0) links.push(link); else links[index] = link;
    });
    const sorted = immutable(links.sort((a, b) => `${a.cause}\u0000${a.effect}`.localeCompare(`${b.cause}\u0000${b.effect}`)));
    this.graphs = new Map([...this.graphs, [keyOf(scope), sorted]]); return immutable({ ...scope, links: copy(sorted) });
  }
  graph(scope: CognitiveScope): CreativeCausalGraph { return immutable({ ...scope, links: copy(this.graphs.get(keyOf(scope)) ?? []) }); }
  path(scope: CognitiveScope, from: string, to: string): readonly CausalLink[] {
    const links = this.graph(scope).links; const visited = new Set<string>();
    const visit = (node: string): CausalLink[] | undefined => { if (node === to) return []; if (visited.has(node)) return undefined; visited.add(node);
      for (const link of links.filter(({ cause }) => cause === node)) { const tail = visit(link.effect); if (tail) return [link, ...tail]; } return undefined; };
    return immutable(visit(from) ?? []);
  }
}

export interface CounterfactualCandidate { readonly id: string; readonly mode: "LOCAL" | "HYBRID" | "AI"; readonly quality: number; readonly credits: number; readonly latencyMs?: number; readonly satisfaction?: number }
export interface CounterfactualComparison { readonly alternativeId: string; readonly qualityDelta: number; readonly creditDelta: number; readonly latencyDeltaMs: number; readonly satisfactionDelta: number; readonly justified: boolean; readonly conclusion: string }
export interface CounterfactualAnalysis { readonly selectedId: string; readonly comparisons: readonly CounterfactualComparison[]; readonly bestAlternativeId?: string }
export class CounterfactualDecisionEngine {
  analyze(selected: CounterfactualCandidate, candidates: readonly CounterfactualCandidate[], minimumQualityPerCredit = .5): CounterfactualAnalysis {
    const comparisons = candidates.filter(({ id }) => id !== selected.id).map((alternative) => {
      const qualityDelta = alternative.quality - selected.quality, creditDelta = alternative.credits - selected.credits;
      const justified = qualityDelta > 0 && (creditDelta <= 0 || qualityDelta / creditDelta >= minimumQualityPerCredit);
      return immutable({ alternativeId: alternative.id, qualityDelta, creditDelta, latencyDeltaMs: (alternative.latencyMs ?? 0) - (selected.latencyMs ?? 0),
        satisfactionDelta: (alternative.satisfaction ?? 0) - (selected.satisfaction ?? 0), justified,
        conclusion: justified ? `${alternative.mode} justified: +${qualityDelta} quality for ${creditDelta} credits` : `${alternative.mode} not justified: ${qualityDelta} quality for ${creditDelta} credits` });
    }).sort((a, b) => b.qualityDelta - a.qualityDelta || a.creditDelta - b.creditDelta || a.alternativeId.localeCompare(b.alternativeId));
    return immutable({ selectedId: selected.id, comparisons, bestAlternativeId: comparisons[0]?.alternativeId });
  }
}

export interface CreativePrinciple { readonly id: string; readonly category: string; readonly recommendation: string; readonly weight: number; readonly confidence: number; readonly source: string; readonly supportCount: number }
export class CreativePrincipleLibrary {
  private principles: readonly CreativePrinciple[];
  constructor(seed: readonly CreativePrinciple[] = []) { this.principles = immutable(copy(seed)); }
  add(principle: CreativePrinciple): CreativePrincipleLibrary { return new CreativePrincipleLibrary([...this.principles, copy(principle)]); }
  find(category: string): readonly CreativePrinciple[] { return immutable(this.principles.filter((item) => item.category.toLowerCase() === category.toLowerCase()).map(copy).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))); }
  all(): readonly CreativePrinciple[] { return immutable(this.principles.map(copy)); }
  static defaults(): CreativePrincipleLibrary { return new CreativePrincipleLibrary([
    { id: "luxury-light", category: "Luxury", recommendation: "soft light", weight: .9, confidence: .8, source: "DESIGN_KNOWLEDGE", supportCount: 1 },
    { id: "catalog-color", category: "Catalog", recommendation: "accurate colors", weight: 1, confidence: .9, source: "DESIGN_KNOWLEDGE", supportCount: 1 },
    { id: "portrait-skin", category: "Portrait", recommendation: "preserve skin texture", weight: 1, confidence: .9, source: "DESIGN_KNOWLEDGE", supportCount: 1 },
  ]); }
}

export interface TasteAssessment { readonly technicalQuality: number; readonly creativePreference: number; readonly alignment: number; readonly explanation: readonly string[] }
export class HumanTasteModel {
  assess(technical: Readonly<Record<string, number>>, preferred: Readonly<Record<string, number>>, observed: Readonly<Record<string, number>>): TasteAssessment {
    const technicalQuality = clamp(mean(Object.values(technical))); const keys = [...new Set([...Object.keys(preferred), ...Object.keys(observed)])].sort();
    const creativePreference = clamp(1 - mean(keys.map((key) => Math.abs((preferred[key] ?? .5) - (observed[key] ?? .5)))));
    return immutable({ technicalQuality, creativePreference, alignment: creativePreference,
      explanation: [`Technical quality is based on ${Object.keys(technical).length} objective signals`, `Taste alignment is based on ${keys.length} preference signals`] });
  }
}

export interface DecisionReflection { readonly id: string; readonly decisionId: string; readonly scope: CognitiveScope; readonly helped: readonly string[]; readonly harmed: readonly string[]; readonly useless: readonly string[]; readonly tryLater: readonly string[]; readonly canRemoveAI: boolean; readonly createdAt: number }
export class DecisionReflectionEngine {
  constructor(private readonly dependencies: CognitiveDependencies) {}
  reflect(scope: CognitiveScope, input: { readonly decisionId: string; readonly contributions: Readonly<Record<string, number>>; readonly alternatives?: readonly CounterfactualCandidate[]; readonly selected?: CounterfactualCandidate }): DecisionReflection {
    const entries = Object.entries(input.contributions).sort(([a], [b]) => a.localeCompare(b)); const local = input.alternatives?.filter(({ mode }) => mode === "LOCAL").sort((a, b) => b.quality - a.quality || a.id.localeCompare(b.id))[0];
    return immutable({ id: this.dependencies.createId(), decisionId: input.decisionId, scope: copy(scope), helped: entries.filter(([, value]) => value > 0).map(([key]) => key),
      harmed: entries.filter(([, value]) => value < 0).map(([key]) => key), useless: entries.filter(([, value]) => value === 0).map(([key]) => key),
      tryLater: entries.filter(([, value]) => value < 0).map(([key]) => `adjust ${key}`), canRemoveAI: Boolean(input.selected?.mode === "AI" && local && local.quality >= input.selected.quality), createdAt: this.dependencies.now() });
  }
}

export type ExplorationMode = "EXPLOIT" | "EXPLORE" | "BALANCED";
export class ExplorationPolicy {
  decide(input: { readonly mode: ExplorationMode; readonly confidence: number; readonly risk: number; readonly experience: number }): Readonly<{ action: "EXPLOIT" | "EXPLORE"; score: number; reasons: readonly string[] }> {
    const score = clamp((1 - input.confidence) * .4 + (1 - input.risk) * .3 + (1 - input.experience) * .3);
    const explore = input.mode === "EXPLORE" || (input.mode === "BALANCED" && score >= .5);
    return immutable({ action: input.mode === "EXPLOIT" ? "EXPLOIT" : explore ? "EXPLORE" : "EXPLOIT", score, reasons: [`mode=${input.mode}`, `explorationScore=${score}`] });
  }
}

export interface CompressibleDecision extends CognitiveScope { readonly id: string; readonly archetype: string; readonly operations: readonly string[]; readonly quality: number; readonly accepted: boolean }
export interface DecisionTemplate extends CognitiveScope { readonly id: string; readonly name: string; readonly operations: readonly string[]; readonly decisionIds: readonly string[]; readonly support: number; readonly averageQuality: number; readonly acceptanceRate: number }
export class DecisionCompressionEngine {
  constructor(private readonly dependencies: CognitiveDependencies) {}
  compress(scope: CognitiveScope, decisions: readonly CompressibleDecision[]): readonly DecisionTemplate[] {
    const scoped = decisions.filter((item) => sameScope(scope, item)); const groups = new Map<string, CompressibleDecision[]>();
    scoped.forEach((item) => { const key = `${item.archetype}\u0000${[...item.operations].sort().join("|")}`; groups.set(key, [...(groups.get(key) ?? []), item]); });
    return immutable([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([, group]) => ({ ...scope, id: this.dependencies.createId(), name: group[0].archetype,
      operations: [...group[0].operations].sort(), decisionIds: group.map(({ id }) => id).sort(), support: group.length,
      averageQuality: mean(group.map(({ quality }) => quality)), acceptanceRate: group.filter(({ accepted }) => accepted).length / group.length })));
  }
}

export interface CreativeTimelineEvent extends CognitiveScope { readonly id: string; readonly kind: "TASTE" | "STRATEGY" | "ARCHETYPE" | "CREATIVE_DNA"; readonly value: string; readonly confidence: number; readonly createdAt: number }
export class CreativeTimeline {
  private events: readonly CreativeTimelineEvent[] = immutable([]);
  constructor(private readonly dependencies: CognitiveDependencies) {}
  add(scope: CognitiveScope, kind: CreativeTimelineEvent["kind"], value: string, confidence: number): CreativeTimelineEvent { const event = immutable({ ...scope, id: this.dependencies.createId(), kind, value, confidence: clamp(confidence), createdAt: this.dependencies.now() }); this.events = immutable([...this.events, event]); return event; }
  history(scope: CognitiveScope): readonly CreativeTimelineEvent[] { return immutable(this.events.filter((event) => sameScope(event, scope)).map(copy).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))); }
}

export type ExpertDomain = "LIGHTING" | "COMPOSITION" | "COST" | "RISK" | "QUALITY" | "TASTE";
export interface ExpertOpinion { readonly expert: string; readonly domain: ExpertDomain; readonly score: number; readonly confidence: number; readonly reasons: readonly string[] }
export interface CreativeExpert { readonly name: string; readonly domain: ExpertDomain; evaluate(candidate: Readonly<Record<string, number>>): ExpertOpinion }
export class DomainCreativeExpert implements CreativeExpert {
  constructor(readonly name: string, readonly domain: ExpertDomain, private readonly feature: string) {}
  evaluate(candidate: Readonly<Record<string, number>>): ExpertOpinion { const raw = candidate[this.feature] ?? .5; const score = this.domain === "COST" || this.domain === "RISK" ? 1 - raw : raw; return immutable({ expert: this.name, domain: this.domain, score: clamp(score), confidence: candidate[this.feature] === undefined ? .3 : .9, reasons: [`${this.feature}=${raw}`] }); }
}
export class ExpertCouncil {
  constructor(private readonly experts: readonly CreativeExpert[]) {}
  evaluate(candidate: Readonly<Record<string, number>>): Readonly<{ score: number; opinions: readonly ExpertOpinion[]; explanation: readonly string[] }> { const opinions = this.experts.map((expert) => expert.evaluate(candidate)).sort((a, b) => a.domain.localeCompare(b.domain) || a.expert.localeCompare(b.expert)); const weight = opinions.reduce((sum, item) => sum + item.confidence, 0); return immutable({ score: weight ? opinions.reduce((sum, item) => sum + item.score * item.confidence, 0) / weight : 0, opinions, explanation: opinions.map((item) => `${item.domain}: ${item.score}`) }); }
}

export interface AdaptiveHeuristic { readonly name: string; readonly weight: number; readonly evidence: number; readonly version: number; readonly explanation: string }
export class AdaptiveHeuristicEngine {
  adapt(heuristics: readonly AdaptiveHeuristic[], feedback: Readonly<Record<string, number>>, learningRate = .05): readonly AdaptiveHeuristic[] { return immutable(heuristics.map((heuristic) => { const signal = Math.max(-1, Math.min(1, feedback[heuristic.name] ?? 0)); const weight = clamp(heuristic.weight + signal * learningRate / Math.sqrt(heuristic.evidence + 1)); return { name: heuristic.name, weight, evidence: heuristic.evidence + (signal === 0 ? 0 : 1), version: heuristic.version + 1, explanation: `${heuristic.name}: ${heuristic.weight} + ${signal}*${learningRate}/sqrt(${heuristic.evidence + 1}) = ${weight}` }; }).sort((a, b) => a.name.localeCompare(b.name))); }
}

export interface DecisionBenchmarkScenario { readonly id: string; readonly expected: Readonly<{ quality: number; credits: number; latency: number; satisfaction: number; stability: number; decisionId: string }>; readonly tolerance?: number }
export class DecisionBenchmarkSuite {
  constructor(private readonly scenarios: readonly DecisionBenchmarkScenario[]) {}
  compare(results: Readonly<Record<string, DecisionBenchmarkScenario["expected"]>>): Readonly<{ passed: boolean; consistency: number; details: readonly Readonly<{ scenarioId: string; passed: boolean; differences: Readonly<Record<string, number>> }>[] }> {
    const details = this.scenarios.map((scenario) => { const actual = results[scenario.id]; const tolerance = scenario.tolerance ?? 0; const differences = { quality: Math.abs((actual?.quality ?? Infinity) - scenario.expected.quality), credits: Math.abs((actual?.credits ?? Infinity) - scenario.expected.credits), latency: Math.abs((actual?.latency ?? Infinity) - scenario.expected.latency), satisfaction: Math.abs((actual?.satisfaction ?? Infinity) - scenario.expected.satisfaction), stability: Math.abs((actual?.stability ?? Infinity) - scenario.expected.stability) }; return immutable({ scenarioId: scenario.id, passed: Boolean(actual) && actual.decisionId === scenario.expected.decisionId && Object.values(differences).every((value) => value <= tolerance), differences }); });
    return immutable({ passed: details.every((item) => item.passed), consistency: details.length ? details.filter((item) => item.passed).length / details.length : 1, details });
  }
}

export interface EvolvingKnowledgeRule { readonly id: string; readonly principle: CreativePrinciple; readonly generation: number; readonly parent?: string; readonly children: readonly string[]; readonly confidenceEvolution: readonly number[]; readonly supportEvolution: readonly number[] }
export class KnowledgeEvolutionEngine {
  private rules: readonly EvolvingKnowledgeRule[] = immutable([]);
  constructor(private readonly dependencies: CognitiveDependencies) {}
  evolve(principle: CreativePrinciple, parent?: string): EvolvingKnowledgeRule { const parentRule = parent ? this.rules.find(({ id }) => id === parent) : undefined; if (parent && !parentRule) throw new Error(`Unknown parent rule: ${parent}`); const rule = immutable({ id: this.dependencies.createId(), principle: copy(principle), generation: (parentRule?.generation ?? -1) + 1, parent, children: [], confidenceEvolution: [...(parentRule?.confidenceEvolution ?? []), principle.confidence], supportEvolution: [...(parentRule?.supportEvolution ?? []), principle.supportCount] }); this.rules = immutable(this.rules.map((item) => item.id === parent ? { ...item, children: [...item.children, rule.id] } : item).concat(rule)); return rule; }
  lineage(id: string): readonly EvolvingKnowledgeRule[] { const lineage: EvolvingKnowledgeRule[] = []; let rule = this.rules.find((item) => item.id === id); while (rule) { lineage.unshift(copy(rule)); rule = rule.parent ? this.rules.find((item) => item.id === rule!.parent) : undefined; } return immutable(lineage); }
}

export const DECISION_EXPLAINABILITY_V5_STAGES = immutable(["Prompt", "Intent Space", "Goals", "Constraints", "World State", "Gap Analysis", "Candidate Generation", "Counterfactual Analysis", "Causal Graph", "Creative Principles", "Expert Council", "Decision Tournament", "Winner", "Reflection", "Learning", "Creative DNA", "Decision Model"] as const);
export interface ExplainabilityV5Node { readonly stage: typeof DECISION_EXPLAINABILITY_V5_STAGES[number]; readonly value: string; readonly next?: ExplainabilityV5Node }
export class DecisionExplainabilityV5 { build(values: Partial<Record<ExplainabilityV5Node["stage"], string>>): ExplainabilityV5Node { let next: ExplainabilityV5Node | undefined; [...DECISION_EXPLAINABILITY_V5_STAGES].reverse().forEach((stage) => { next = immutable({ stage, value: values[stage] ?? "not available", ...(next ? { next } : {}) }); }); return next!; } flatten(root: ExplainabilityV5Node): readonly ExplainabilityV5Node[] { const result: ExplainabilityV5Node[] = []; let node: ExplainabilityV5Node | undefined = root; while (node) { result.push(node); node = node.next; } return immutable(result); } }

export interface DecisionEvolutionDimensions { readonly learning: number; readonly stability: number; readonly creativity: number; readonly adaptability: number; readonly costEfficiency: number; readonly goalCompletion: number; readonly tasteAlignment: number; readonly technicalQuality: number; readonly confidence: number }
export class DecisionEvolutionScore { calculate(input: DecisionEvolutionDimensions): Readonly<{ score: number; dimensions: DecisionEvolutionDimensions; explanation: readonly string[] }> { const entries = Object.entries(input).sort(([a], [b]) => a.localeCompare(b)) as [keyof DecisionEvolutionDimensions, number][]; const dimensions = Object.fromEntries(entries.map(([key, value]) => [key, clamp(value)])) as unknown as DecisionEvolutionDimensions; return immutable({ score: mean(Object.values(dimensions)), dimensions, explanation: entries.map(([key]) => `${key}=${dimensions[key]}`) }); } }
