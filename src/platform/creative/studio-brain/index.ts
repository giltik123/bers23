/** Deterministic, infrastructure-free architecture for studio-level creative reasoning. */
export type StudioScope = Readonly<{ tenantId: string; projectId: string; userId: string }>;
export type StudioDependencies = Readonly<{ id: () => string; clock: () => number; random: () => number }>;

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number) => Number(value.toFixed(6));
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const scopeKey = (scope: StudioScope) => `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;
export function studioImmutable<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as object)) studioImmutable(child);
    Object.freeze(value);
  }
  return value;
}

export interface StudioContext {
  readonly scope: StudioScope;
  readonly prompt: string;
  readonly intent: readonly string[];
  readonly goals: readonly string[];
  readonly constraints: Readonly<Record<string, number | boolean | string>>;
}
export interface ExpertOpinion {
  readonly id: string;
  readonly expert: string;
  readonly domain: string;
  readonly recommendation: string;
  readonly confidence: number;
  readonly reason: string;
  readonly operations: readonly string[];
  readonly risks: readonly string[];
  readonly expectedQuality: number;
  readonly expectedCost: number;
}
export interface StudioExpert {
  readonly name: string;
  readonly domain: string;
  opine(context: StudioContext): ExpertOpinion;
}

export interface ExpertPolicy {
  readonly keywords: readonly string[];
  readonly recommendation: string;
  readonly operations: readonly string[];
  readonly risks: readonly string[];
  readonly quality: number;
  readonly cost: number;
}
export class IndependentStudioExpert implements StudioExpert {
  constructor(
    readonly name: string,
    readonly domain: string,
    private readonly dependencies: Pick<StudioDependencies, 'id'>,
    private readonly policy: ExpertPolicy,
  ) {}
  opine(context: StudioContext): ExpertOpinion {
    const text = `${context.prompt} ${context.intent.join(' ')} ${context.goals.join(' ')}`.toLowerCase();
    const matches = this.policy.keywords.filter(keyword => text.includes(keyword.toLowerCase())).length;
    const confidence = round(clamp(.45 + matches * .12));
    return studioImmutable({
      id: this.dependencies.id(), expert: this.name, domain: this.domain,
      recommendation: this.policy.recommendation, confidence,
      reason: `${this.domain}: ${matches} contextual signal(s) matched`,
      operations: [...this.policy.operations], risks: [...this.policy.risks],
      expectedQuality: round(clamp(this.policy.quality + matches * .02)),
      expectedCost: Math.max(0, this.policy.cost),
    });
  }
}

export const createDefaultStudioExperts = (id: () => string): readonly StudioExpert[] => studioImmutable([
  new IndependentStudioExpert('Creative Director', 'creative', { id }, { keywords: ['creative', 'luxury'], recommendation: 'Protect the central idea', operations: ['creative_direction'], risks: ['idea dilution'], quality: .84, cost: 0 }),
  new IndependentStudioExpert('Art Director', 'art', { id }, { keywords: ['art', 'editorial'], recommendation: 'Strengthen visual language', operations: ['visual_hierarchy'], risks: ['visual overload'], quality: .85, cost: 0 }),
  new IndependentStudioExpert('Brand Director', 'brand', { id }, { keywords: ['brand', 'catalog'], recommendation: 'Preserve brand identity', operations: ['brand_alignment'], risks: ['brand drift'], quality: .82, cost: 0 }),
  new IndependentStudioExpert('Lighting Director', 'lighting', { id }, { keywords: ['light', 'luxury'], recommendation: 'Use soft directional light', operations: ['light_adjustment'], risks: ['flat lighting'], quality: .88, cost: 0 }),
  new IndependentStudioExpert('Composition Director', 'composition', { id }, { keywords: ['composition', 'catalog'], recommendation: 'Fix composition before enhancement', operations: ['crop', 'visual_hierarchy'], risks: ['weak focus'], quality: .86, cost: 0 }),
  new IndependentStudioExpert('Fashion Director', 'fashion', { id }, { keywords: ['fashion', 'editorial'], recommendation: 'Add editorial tension', operations: ['contrast', 'texture'], risks: ['trend mismatch'], quality: .84, cost: 0 }),
  new IndependentStudioExpert('Marketing Director', 'marketing', { id }, { keywords: ['sell', 'catalog', 'campaign'], recommendation: 'Optimize commercial clarity', operations: ['product_focus'], risks: ['weak conversion'], quality: .83, cost: 0 }),
  new IndependentStudioExpert('Cost Director', 'cost', { id }, { keywords: ['budget', 'cheap', 'credits'], recommendation: 'Prefer local operations', operations: ['local_first'], risks: ['unnecessary credits'], quality: .78, cost: 0 }),
  new IndependentStudioExpert('AI Director', 'ai', { id }, { keywords: ['generate', 'replace', 'ai'], recommendation: 'Use AI only for semantic change', operations: ['ai_if_required'], risks: ['AI artifacts'], quality: .9, cost: 10 }),
  new IndependentStudioExpert('Quality Director', 'quality', { id }, { keywords: ['quality', 'premium', 'luxury'], recommendation: 'Apply a final quality gate', operations: ['quality_check'], risks: ['quality regression'], quality: .92, cost: 0 }),
]);

export interface DebatePosition {
  readonly topic: string;
  readonly supporters: readonly string[];
  readonly opponents: readonly string[];
  readonly evidence: readonly string[];
  readonly tension: number;
}
export interface StudioDebate {
  readonly id: string;
  readonly scope: StudioScope;
  readonly createdAt: number;
  readonly opinions: readonly ExpertOpinion[];
  readonly positions: readonly DebatePosition[];
}
export class DebateEngine {
  constructor(private readonly dependencies: Pick<StudioDependencies, 'id' | 'clock'>) {}
  debate(scope: StudioScope, opinions: readonly ExpertOpinion[]): StudioDebate {
    const topics = new Set(opinions.flatMap(opinion => opinion.operations));
    const positions = [...topics].sort().map(topic => {
      const supporters = opinions.filter(opinion => opinion.operations.includes(topic)).map(opinion => opinion.expert).sort();
      const opponents = opinions.filter(opinion => !opinion.operations.includes(topic) && opinion.risks.some(risk => risk.toLowerCase().includes(topic.replaceAll('_', ' ')))).map(opinion => opinion.expert).sort();
      return { topic, supporters, opponents, evidence: opinions.filter(opinion => supporters.includes(opinion.expert) || opponents.includes(opinion.expert)).map(opinion => opinion.reason), tension: round(opponents.length / Math.max(1, supporters.length + opponents.length)) };
    });
    return studioImmutable({ id: this.dependencies.id(), scope: { ...scope }, createdAt: this.dependencies.clock(), opinions: [...opinions], positions });
  }
}

export interface StudioConsensus {
  readonly acceptedIdeas: readonly string[];
  readonly rejectedIdeas: readonly string[];
  readonly minorityOpinion: readonly string[];
  readonly confidence: number;
  readonly explanation: readonly string[];
}
export class ConsensusEngine {
  build(debate: StudioDebate): StudioConsensus {
    const totalWeight = debate.opinions.reduce((sum, opinion) => sum + opinion.confidence, 0);
    const weighted = new Map<string, number>();
    for (const opinion of debate.opinions) for (const operation of opinion.operations) weighted.set(operation, (weighted.get(operation) ?? 0) + opinion.confidence);
    const ranked = [...weighted].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const acceptedIdeas = ranked.filter(([, weight]) => weight / Math.max(1, totalWeight) >= .12).map(([idea]) => idea);
    const minorityOpinion = ranked.filter(([, weight]) => weight / Math.max(1, totalWeight) < .12 && weight / Math.max(1, totalWeight) >= .06).map(([idea]) => idea);
    const rejectedIdeas = ranked.filter(([, weight]) => weight / Math.max(1, totalWeight) < .06).map(([idea]) => idea);
    const confidence = round(acceptedIdeas.length ? mean(acceptedIdeas.map(idea => (weighted.get(idea) ?? 0) / Math.max(1, totalWeight))) : 0);
    return studioImmutable({ acceptedIdeas, rejectedIdeas, minorityOpinion, confidence, explanation: ranked.map(([idea, weight]) => `${idea}: ${round(weight / Math.max(1, totalWeight))}`) });
  }
}

export interface StudioOutcome {
  readonly scope: StudioScope; readonly intent: string; readonly operations: readonly string[];
  readonly accepted: boolean; readonly quality: number; readonly satisfaction: number;
}
export interface DirectorMemoryPattern {
  readonly scope: StudioScope; readonly intent: string; readonly operations: readonly string[];
  readonly frequency: number; readonly successRate: number; readonly averageQuality: number;
  readonly averageSatisfaction: number;
}
export class DirectorMemory {
  learn(outcomes: readonly StudioOutcome[]): readonly DirectorMemoryPattern[] {
    const groups = new Map<string, StudioOutcome[]>();
    for (const outcome of outcomes) {
      const signature = `${scopeKey(outcome.scope)}\u0000${outcome.intent}\u0000${outcome.operations.join('>')}`;
      groups.set(signature, [...(groups.get(signature) ?? []), outcome]);
    }
    return studioImmutable([...groups.values()].map(group => ({ scope: { ...group[0].scope }, intent: group[0].intent, operations: [...group[0].operations], frequency: group.length, successRate: round(group.filter(item => item.accepted).length / group.length), averageQuality: round(mean(group.map(item => item.quality))), averageSatisfaction: round(mean(group.map(item => item.satisfaction))) })).sort((a, b) => b.frequency - a.frequency || a.intent.localeCompare(b.intent)));
  }
}

export interface StudioPrinciple { readonly id: string; readonly domain: string; readonly guidance: readonly string[]; readonly priority: number; readonly weight: number; readonly confidence: number; readonly support: number }
export class CreativePrinciplesEngine {
  constructor(private readonly principles: readonly StudioPrinciple[] = []) {}
  add(principle: StudioPrinciple) { return new CreativePrinciplesEngine(studioImmutable([...this.principles.filter(item => item.id !== principle.id), { ...principle, guidance: [...principle.guidance], priority: clamp(principle.priority), weight: clamp(principle.weight), confidence: clamp(principle.confidence), support: Math.max(0, principle.support) }])); }
  forDomain(domain: string) { return studioImmutable(this.principles.filter(item => item.domain.toLowerCase() === domain.toLowerCase()).sort((a, b) => b.priority * b.weight * b.confidence - a.priority * a.weight * a.confidence || a.id.localeCompare(b.id))); }
}

export type VisualLawName = 'Leading Lines' | 'Golden Ratio' | 'Rule of Thirds' | 'Color Harmony' | 'Contrast' | 'Depth' | 'Negative Space' | 'Focus' | 'Perspective' | 'Hierarchy' | 'Balance';
export class VisualLaws {
  readonly names: readonly VisualLawName[] = studioImmutable(['Leading Lines', 'Golden Ratio', 'Rule of Thirds', 'Color Harmony', 'Contrast', 'Depth', 'Negative Space', 'Focus', 'Perspective', 'Hierarchy', 'Balance']);
  evaluate(signals: Readonly<Partial<Record<VisualLawName, number>>>) { const laws = this.names.map(name => ({ name, score: round(clamp(signals[name] ?? 0)), recommendation: (signals[name] ?? 0) < .6 ? `Improve ${name}` : `Preserve ${name}` })); return studioImmutable({ laws, score: round(mean(laws.map(law => law.score))) }); }
}

export interface TradeoffFactor { readonly name: string; readonly value: number; readonly priority: number }
export interface TradeoffModel { solve(left: TradeoffFactor, right: TradeoffFactor): TradeoffResult }
export interface TradeoffResult { readonly winner: string | 'BALANCED'; readonly leftUtility: number; readonly rightUtility: number; readonly reason: string }
export class HeuristicTradeoffModel implements TradeoffModel {
  solve(left: TradeoffFactor, right: TradeoffFactor) { const leftUtility = round(clamp(left.value) * clamp(left.priority)), rightUtility = round(clamp(right.value) * clamp(right.priority)), winner = Math.abs(leftUtility - rightUtility) < .05 ? 'BALANCED' as const : leftUtility > rightUtility ? left.name : right.name; return studioImmutable({ winner, leftUtility, rightUtility, reason: `${left.name}=${leftUtility}; ${right.name}=${rightUtility}` }); }
}

export type TasteCoordinates = Readonly<Record<string, number>>;
export class CreativeTasteSpace {
  normalize(coordinates: TasteCoordinates) { return studioImmutable(Object.fromEntries(Object.entries(coordinates).sort().map(([key, value]) => [key, round(clamp(value))]))); }
  distance(left: TasteCoordinates, right: TasteCoordinates) { const keys = new Set([...Object.keys(left), ...Object.keys(right)]); return round(Math.sqrt([...keys].reduce((sum, key) => sum + ((left[key] ?? 0) - (right[key] ?? 0)) ** 2, 0))); }
  nearest(point: TasteCoordinates, candidates: Readonly<Record<string, TasteCoordinates>>) { return studioImmutable(Object.entries(candidates).map(([name, coordinates]) => ({ name, distance: this.distance(point, coordinates) })).sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name)));
  }
}

export interface ProjectStyleVector { readonly scope: StudioScope; readonly dimensions: readonly number[]; readonly size: 128 | 256; readonly version: string }
export class StyleVectorEncoder {
  encode(scope: StudioScope, coordinates: TasteCoordinates, size: 128 | 256 = 128): ProjectStyleVector { const entries = Object.entries(coordinates).sort(), dimensions = Array.from({ length: size }, (_, index) => { if (!entries.length) return 0; const [name, value] = entries[index % entries.length]; const hash = [...name].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 997, 7); return round(clamp(value) * (0.5 + (hash % 50) / 100)); }); return studioImmutable({ scope: { ...scope }, dimensions, size, version: 'heuristic-style-v1' }); }
}

export interface CreativeIdentity { readonly scope: StudioScope; readonly creative: TasteCoordinates; readonly visual: TasteCoordinates; readonly editing: TasteCoordinates; readonly ai: TasteCoordinates; readonly revision: number }
export class CreativeIdentityEngine {
  create(scope: StudioScope, parts: Omit<CreativeIdentity, 'scope' | 'revision'>): CreativeIdentity { const taste = new CreativeTasteSpace(); return studioImmutable({ scope: { ...scope }, creative: taste.normalize(parts.creative), visual: taste.normalize(parts.visual), editing: taste.normalize(parts.editing), ai: taste.normalize(parts.ai), revision: 1 }); }
  evolve(identity: CreativeIdentity, signal: Partial<Omit<CreativeIdentity, 'scope' | 'revision'>>, rate = .1) { const blend = (current: TasteCoordinates, update?: TasteCoordinates) => { const keys = new Set([...Object.keys(current), ...Object.keys(update ?? {})]); return studioImmutable(Object.fromEntries([...keys].sort().map(key => [key, round((current[key] ?? .5) * (1 - clamp(rate)) + (update?.[key] ?? current[key] ?? .5) * clamp(rate))]))); }; return studioImmutable({ scope: identity.scope, creative: blend(identity.creative, signal.creative), visual: blend(identity.visual, signal.visual), editing: blend(identity.editing, signal.editing), ai: blend(identity.ai, signal.ai), revision: identity.revision + 1 }); }
}

export interface StrategyGeneration { readonly id: string; readonly name: string; readonly version: number; readonly parentId?: string; readonly operations: readonly string[]; readonly score: number; readonly support: number; readonly createdAt: number }
export class StrategyEvolution {
  constructor(private readonly dependencies: Pick<StudioDependencies, 'id' | 'clock'>, private readonly generations: readonly StrategyGeneration[] = []) {}
  evolve(name: string, operations: readonly string[], score: number, support: number, parentId?: string) { const parent = parentId ? this.generations.find(item => item.id === parentId) : undefined; if (parentId && !parent) throw new Error('Strategy parent does not exist'); const generation = studioImmutable({ id: this.dependencies.id(), name, version: (parent?.version ?? 0) + 1, parentId, operations: [...operations], score: clamp(score), support: Math.max(0, support), createdAt: this.dependencies.clock() }); return new StrategyEvolution(this.dependencies, studioImmutable([...this.generations, generation])); }
  history(name: string) { return studioImmutable(this.generations.filter(item => item.name === name).sort((a, b) => a.version - b.version || a.id.localeCompare(b.id))); }
  best(name: string) { return [...this.history(name)].sort((a, b) => b.score - a.score || b.support - a.support || b.version - a.version)[0]; }
}

export interface KnowledgeFact { readonly id: string; readonly concepts: readonly string[]; readonly outcome: string; readonly confidence: number; readonly support: number }
export class StudioKnowledgeBase {
  constructor(private readonly facts: readonly KnowledgeFact[] = []) {}
  add(fact: KnowledgeFact) { return new StudioKnowledgeBase(studioImmutable([...this.facts.filter(item => item.id !== fact.id), { ...fact, concepts: [...new Set(fact.concepts)].sort(), confidence: clamp(fact.confidence), support: Math.max(0, fact.support) }])); }
  query(concepts: readonly string[]) { const query = new Set(concepts.map(item => item.toLowerCase())); return studioImmutable(this.facts.map(fact => ({ fact, relevance: round(fact.concepts.filter(concept => query.has(concept.toLowerCase())).length / Math.max(1, query.size)) })).filter(item => item.relevance > 0).sort((a, b) => b.relevance * b.fact.confidence - a.relevance * a.fact.confidence || a.fact.id.localeCompare(b.fact.id)));
  }
}

export interface CreativeMetricsProfile { readonly beauty: number; readonly luxury: number; readonly brand: number; readonly composition: number; readonly lighting: number; readonly color: number; readonly emotion: number; readonly commercial: number; readonly consistency: number; readonly innovation: number; readonly aiEfficiency: number }
export class CreativeMetrics {
  evaluate(input: CreativeMetricsProfile) { const normalized = Object.fromEntries(Object.entries(input).map(([name, value]) => [name, round(clamp(value))])) as unknown as CreativeMetricsProfile; return studioImmutable({ ...normalized, overall: round(mean(Object.values(normalized))) }); }
}
export interface CreativeIQProfile { readonly reasoningIQ: number; readonly planningIQ: number; readonly compositionIQ: number; readonly styleIQ: number; readonly brandIQ: number; readonly economyIQ: number; readonly learningIQ: number; readonly creativeIQ: number }
export class CreativeIQ2 {
  evaluate(input: CreativeIQProfile) { const profile = Object.fromEntries(Object.entries(input).map(([name, value]) => [name, round(clamp(value) * 100)])); return studioImmutable({ profile, overall: round(mean(Object.values(profile))), strengths: Object.entries(profile).filter(([, value]) => value >= 80).map(([name]) => name), weaknesses: Object.entries(profile).filter(([, value]) => value < 50).map(([name]) => name) }); }
}

export interface ReplayFrame { readonly sequence: number; readonly kind: 'OPINION' | 'DEBATE' | 'CONSENSUS' | 'DECISION'; readonly value: unknown }
export class StudioReplay {
  capture(debate: StudioDebate, consensus: StudioConsensus, decision: unknown) { const frames: ReplayFrame[] = [...debate.opinions.map((opinion, index) => ({ sequence: index + 1, kind: 'OPINION' as const, value: opinion })), { sequence: debate.opinions.length + 1, kind: 'DEBATE', value: debate }, { sequence: debate.opinions.length + 2, kind: 'CONSENSUS', value: consensus }, { sequence: debate.opinions.length + 3, kind: 'DECISION', value: decision }]; return studioImmutable({ debateId: debate.id, frames }); }
}
export interface DirectorTimelineEvent { readonly id: string; readonly timestamp: number; readonly kind: string; readonly value: unknown }
export class DirectorTimeline {
  constructor(private readonly events: readonly DirectorTimelineEvent[] = []) {}
  add(event: DirectorTimelineEvent) { return new DirectorTimeline(studioImmutable([...this.events.filter(item => item.id !== event.id), { ...event }])); }
  history(kind?: string) { return studioImmutable(this.events.filter(event => !kind || event.kind === kind).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))); }
}

export interface ReasoningModel { reason(context: StudioContext, opinions: readonly ExpertOpinion[]): Readonly<{ recommendation: string; confidence: number }> }
export interface DirectorModel { decide(context: StudioContext, consensus: StudioConsensus): Readonly<{ operations: readonly string[]; reason: string }> }
export interface ConsensusModel { build(debate: StudioDebate): StudioConsensus }
export interface TasteModel { encode(coordinates: TasteCoordinates): TasteCoordinates }
export interface WorldModel { evaluate(context: StudioContext): Readonly<Record<string, number>> }
export interface LearningModel { learn(outcomes: readonly StudioOutcome[]): readonly DirectorMemoryPattern[] }
export class HeuristicReasoningModel implements ReasoningModel { reason(_context: StudioContext, opinions: readonly ExpertOpinion[]) { const ranked = [...opinions].sort((a, b) => b.confidence - a.confidence || b.expectedQuality - a.expectedQuality || a.expert.localeCompare(b.expert)); return studioImmutable({ recommendation: ranked[0]?.recommendation ?? 'No recommendation', confidence: ranked[0]?.confidence ?? 0 }); } }
export class HeuristicDirectorModel implements DirectorModel { decide(_context: StudioContext, consensus: StudioConsensus) { return studioImmutable({ operations: [...consensus.acceptedIdeas], reason: `Consensus confidence ${consensus.confidence}` }); } }
export class HeuristicTasteModel implements TasteModel { encode(coordinates: TasteCoordinates) { return new CreativeTasteSpace().normalize(coordinates); } }
export class HeuristicWorldModel implements WorldModel { evaluate(context: StudioContext) { return studioImmutable({ promptComplexity: round(clamp(context.prompt.split(/\s+/).length / 30)), goalCount: round(clamp(context.goals.length / 10)), constraintCount: round(clamp(Object.keys(context.constraints).length / 10)) }); } }
export class HeuristicLearningModel implements LearningModel { learn(outcomes: readonly StudioOutcome[]) { return new DirectorMemory().learn(outcomes); } }

export class CreativeStudioBrain {
  constructor(private readonly experts: readonly StudioExpert[], private readonly debateEngine: DebateEngine, private readonly consensusModel: ConsensusModel, private readonly tradeoffModel: TradeoffModel, private readonly directorModel: DirectorModel) {}
  think(context: StudioContext) { const opinions = this.experts.map(expert => expert.opine(context)); const debate = this.debateEngine.debate(context.scope, opinions); const consensus = this.consensusModel.build(debate); const tradeoff = this.tradeoffModel.solve({ name: 'quality', value: mean(opinions.map(opinion => opinion.expectedQuality)), priority: .8 }, { name: 'cost', value: clamp(1 - mean(opinions.map(opinion => opinion.expectedCost)) / 100), priority: .7 }); const decision = this.directorModel.decide(context, consensus); return studioImmutable({ context: { ...context, scope: { ...context.scope }, intent: [...context.intent], goals: [...context.goals], constraints: { ...context.constraints } }, opinions, debate, consensus, tradeoff, decision, expectedResult: { quality: round(mean(opinions.map(opinion => opinion.expectedQuality))), cost: round(mean(opinions.map(opinion => opinion.expectedCost))) } }); }
}

export class StudioDebugger {
  trace(values: Partial<Record<string, unknown>>) { const names = ['Prompt', 'Intent', 'Goals', 'Experts', 'Debate', 'Consensus', 'Tradeoffs', 'Knowledge', 'Identity', 'Reasoning', 'Decision', 'Expected Result', 'Creative IQ']; const stages = names.map(name => ({ name, value: values[name] ?? null })); return studioImmutable({ version: 3, stages, text: stages.map(stage => `${stage.name}: ${JSON.stringify(stage.value)}`).join('\n') }); }
}
