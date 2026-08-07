/** Infrastructure-free Creative Director intelligence layer. */
export type DirectorScope = Readonly<{ tenantId: string; projectId: string; userId: string }>;
export type DirectorDependencies = Readonly<{ id: () => string; clock: () => number; random: () => number }>;

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number) => Number(value.toFixed(6));
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const scopeKey = (scope: DirectorScope) => `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;
const assertScope = (left: DirectorScope, right: DirectorScope) => {
  if (scopeKey(left) !== scopeKey(right)) throw new Error('Cross-scope operation is forbidden');
};
export function directorImmutable<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as object)) directorImmutable(child);
    Object.freeze(value);
  }
  return value;
}

export interface CreativeVision {
  readonly id: string; readonly scope: DirectorScope; readonly createdAt: number;
  readonly visionGoals: readonly string[]; readonly mood: readonly string[];
  readonly style: readonly string[]; readonly commercialIntent: string;
  readonly visualDirection: readonly string[]; readonly confidence: number;
}
export class CreativeVisionEngine {
  constructor(private readonly dependencies: DirectorDependencies) {}
  create(scope: DirectorScope, prompt: string): CreativeVision {
    const text = prompt.toLowerCase();
    const luxury = /дорог|luxury|premium/.test(text), catalog = /каталог|catalog|product/.test(text), portrait = /портрет|portrait|face/.test(text);
    const style = [...(luxury ? ['Luxury', 'Premium', 'Minimal', 'Elegant'] : []), ...(catalog ? ['Catalog', 'Clean'] : []), ...(portrait ? ['Portrait'] : [])];
    const unique = [...new Set(style.length ? style : ['Modern'])];
    return directorImmutable({ id: this.dependencies.id(), scope: { ...scope }, createdAt: this.dependencies.clock(), visionGoals: [catalog ? 'Sell Product' : portrait ? 'Express Character' : 'Communicate Idea'], mood: luxury ? ['Warm', 'Elegant'] : ['Clear'], style: unique, commercialIntent: catalog || luxury ? 'Conversion' : 'Engagement', visualDirection: luxury ? ['Soft lighting', 'Warm palette', 'Clean background'] : ['Balanced composition'], confidence: round(clamp(.55 + unique.length * .08)) });
  }
}

export interface VisualLanguage { readonly name: string; readonly devices: Readonly<Record<string, number>>; readonly confidence: number }
const DEFAULT_LANGUAGES: readonly VisualLanguage[] = directorImmutable([
  { name: 'Luxury', devices: { 'Soft lighting': .95, 'Warm palette': .85, 'Premium texture': .9, 'Low noise': .9, 'Balanced contrast': .8 }, confidence: .9 },
  { name: 'Fashion', devices: { 'High contrast': .9, 'Dynamic light': .85, 'Rich texture': .8, 'Editorial composition': .95 }, confidence: .88 },
  { name: 'Minimal', devices: { 'Negative space': .95, 'Clean palette': .9, 'Simple hierarchy': .9 }, confidence: .9 },
]);
export class VisualLanguageEngine {
  constructor(private readonly languages: readonly VisualLanguage[] = DEFAULT_LANGUAGES) {}
  get(name: string) { return this.languages.find(item => item.name.toLowerCase() === name.toLowerCase()); }
  combine(names: readonly string[]) {
    const selected = names.map(name => this.get(name)).filter(Boolean) as VisualLanguage[];
    const devices = new Map<string, number[]>();
    for (const language of selected) for (const [device, weight] of Object.entries(language.devices)) devices.set(device, [...(devices.get(device) ?? []), weight]);
    return directorImmutable({ names: [...names], devices: Object.fromEntries([...devices].sort().map(([device, weights]) => [device, round(mean(weights))])), confidence: round(mean(selected.map(item => item.confidence))) });
  }
  add(language: VisualLanguage) { return new VisualLanguageEngine(directorImmutable([...this.languages.filter(item => item.name !== language.name), { ...language, devices: { ...language.devices }, confidence: clamp(language.confidence) }])); }
}

export interface EmotionProfile { readonly emotions: Readonly<Record<string, number>>; readonly recommendations: readonly string[]; readonly confidence: number }
export class CreativeEmotionEngine {
  analyze(vision: CreativeVision): EmotionProfile {
    const labels = [...vision.mood, ...vision.style];
    const emotions: Record<string, number> = {};
    for (const label of labels) emotions[label] = round(clamp((emotions[label] ?? 0) + vision.confidence));
    const recommendations = [...new Set(labels.flatMap(label => /Luxury|Premium|Elegant/.test(label) ? ['soft light', 'warm palette'] : /Energetic|Fashion/.test(label) ? ['dynamic contrast'] : ['balanced exposure']))].sort();
    return directorImmutable({ emotions, recommendations, confidence: vision.confidence });
  }
}

export interface CreativeNarrative { readonly subject: string; readonly arc: readonly string[]; readonly message: string; readonly confidence: number }
export class CreativeNarrativeEngine {
  build(subject: string, vision: CreativeVision): CreativeNarrative {
    const luxury = vision.style.includes('Luxury'), portrait = vision.style.includes('Portrait');
    const arc = luxury ? [subject, 'Status', 'Confidence', 'Success'] : portrait ? [subject, 'Warmth', 'Connection', 'Emotion'] : [subject, 'Attention', 'Understanding', 'Action'];
    return directorImmutable({ subject, arc, message: arc.at(-1)!, confidence: round(clamp(vision.confidence * .9)) });
  }
}

export interface CompositionProfile { readonly hierarchy: number; readonly balance: number; readonly focus: number; readonly negativeSpace: number; readonly rhythm: number; readonly perspective: number; readonly symmetry: number; readonly ruleOfThirds: number }
export class CompositionExpert {
  evaluate(profile: CompositionProfile) {
    const normalized = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, clamp(value)])) as unknown as CompositionProfile;
    const score = round(mean(Object.values(normalized)));
    const weaknesses = Object.entries(normalized).filter(([, value]) => value < .5).map(([name]) => name).sort();
    return directorImmutable({ domain: 'Composition', score, confidence: round(.5 + score / 2), weaknesses, recommendation: weaknesses.length ? `Improve ${weaknesses.join(', ')}` : 'Preserve composition' });
  }
}

const COLOR_MEANINGS = directorImmutable({ Gold: ['Luxury', 'Prestige'], Blue: ['Trust', 'Calm'], Red: ['Energy', 'Urgency'], White: ['Purity', 'Clean'], Black: ['Premium', 'Power'] } as const);
export class ColorPsychologyEngine {
  meanings(color: string): readonly string[] { const key = Object.keys(COLOR_MEANINGS).find(item => item.toLowerCase() === color.toLowerCase()) as keyof typeof COLOR_MEANINGS | undefined; return directorImmutable(key ? [...COLOR_MEANINGS[key]] : []); }
  recommend(emotion: string) { return directorImmutable(Object.entries(COLOR_MEANINGS).filter(([, meanings]) => (meanings as readonly string[]).some(item => item.toLowerCase() === emotion.toLowerCase())).map(([color]) => color)); }
}
const LIGHT_MEANINGS = directorImmutable({ Soft: ['Luxury', 'Gentle'], Hard: ['Drama', 'Strength'], Warm: ['Comfort', 'Friendly'], Cold: ['Technology', 'Precision'] } as const);
export class LightingPsychologyEngine {
  meanings(light: string): readonly string[] { const key = Object.keys(LIGHT_MEANINGS).find(item => item.toLowerCase() === light.toLowerCase()) as keyof typeof LIGHT_MEANINGS | undefined; return directorImmutable(key ? [...LIGHT_MEANINGS[key]] : []); }
  recommend(emotion: string) { return directorImmutable(Object.entries(LIGHT_MEANINGS).filter(([, meanings]) => (meanings as readonly string[]).some(item => item.toLowerCase() === emotion.toLowerCase())).map(([light]) => light)); }
}

export interface BrandDNA { readonly projectId: string; readonly preferredPalette: readonly string[]; readonly preferredMood: readonly string[]; readonly preferredLighting: readonly string[]; readonly preferredStyle: readonly string[]; readonly consistencyRules: readonly string[] }
export class BrandIdentityEngine {
  constructor(private readonly brands: Readonly<Record<string, BrandDNA>> = {}) {}
  set(brand: BrandDNA) { return new BrandIdentityEngine(directorImmutable({ ...this.brands, [brand.projectId]: { ...brand, preferredPalette: [...brand.preferredPalette], preferredMood: [...brand.preferredMood], preferredLighting: [...brand.preferredLighting], preferredStyle: [...brand.preferredStyle], consistencyRules: [...brand.consistencyRules] } })); }
  get(projectId: string) { return this.brands[projectId]; }
  alignment(projectId: string, input: { palette: readonly string[]; mood: readonly string[]; lighting: readonly string[]; style: readonly string[] }) { const brand = this.get(projectId); if (!brand) return 0; const pairs = [[brand.preferredPalette, input.palette], [brand.preferredMood, input.mood], [brand.preferredLighting, input.lighting], [brand.preferredStyle, input.style]] as const; return round(mean(pairs.map(([expected, actual]) => expected.length ? expected.filter(value => actual.includes(value)).length / expected.length : 1))); }
}

export interface TimedDirectorStyle { readonly scope: DirectorScope; readonly timestamp: number; readonly style: string; readonly strength: number }
export class StyleEvolutionEngine {
  analyze(events: readonly TimedDirectorStyle[]) { if (!events.length) return directorImmutable({ path: [], transitions: [], current: undefined }); const scope = events[0].scope; if (events.some(item => scopeKey(item.scope) !== scopeKey(scope))) throw new Error('Style history must belong to one scope'); const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp || a.style.localeCompare(b.style)); return directorImmutable({ path: sorted.map(item => item.style), transitions: sorted.slice(1).map((item, index) => ({ from: sorted[index].style, to: item.style, delta: round(item.strength - sorted[index].strength) })), current: sorted.at(-1)!.style }); }
}

export interface SeriesItem { readonly id: string; readonly scope: DirectorScope; readonly features: Readonly<Record<string, number>> }
export class CreativeConsistencyEngine {
  evaluate(items: readonly SeriesItem[]) { if (!items.length) return directorImmutable({ score: 1, deviations: [] }); const scope = items[0].scope; if (items.some(item => scopeKey(item.scope) !== scopeKey(scope))) throw new Error('Series must belong to one scope'); const keys = new Set(items.flatMap(item => Object.keys(item.features))); const deviations = [...keys].sort().map(feature => { const values = items.map(item => item.features[feature] ?? 0), center = mean(values); return { feature, deviation: round(mean(values.map(value => Math.abs(value - center)))) }; }); return directorImmutable({ score: round(clamp(1 - mean(deviations.map(item => item.deviation)))), deviations }); }
}
export class CreativeDiversityEngine {
  evaluate(items: readonly SeriesItem[]) { if (items.length < 2) return directorImmutable({ score: 0, pairDistances: [] }); const scope = items[0].scope; if (items.some(item => scopeKey(item.scope) !== scopeKey(scope))) throw new Error('Variants must belong to one scope'); const pairs: { left: string; right: string; distance: number }[] = []; for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const keys = new Set([...Object.keys(items[i].features), ...Object.keys(items[j].features)]); pairs.push({ left: items[i].id, right: items[j].id, distance: round(Math.sqrt([...keys].reduce((sum, key) => sum + ((items[i].features[key] ?? 0) - (items[j].features[key] ?? 0)) ** 2, 0))) }); } return directorImmutable({ score: round(mean(pairs.map(item => item.distance))), pairDistances: pairs }); }
}

export class CreativeInspirationEngine {
  combine(styles: readonly string[], random: () => number) { const unique = [...new Set(styles)].sort(); const rotation = unique.length ? Math.floor(clamp(random()) * unique.length) % unique.length : 0; const ordered = [...unique.slice(rotation), ...unique.slice(0, rotation)]; return directorImmutable({ name: ordered.join(' '), sources: ordered, novelty: round(clamp(ordered.length / 4)), explanation: `Combines ${ordered.join(' + ')}` }); }
}

export interface CreativeConstraints { readonly maxCredits?: number; readonly allowAI?: boolean; readonly preserveFace?: boolean; readonly preserveClothing?: boolean; readonly preserveBrand?: boolean }
export class CreativeConstraintEngine {
  validate(candidate: { credits: number; usesAI: boolean; changes: readonly string[] }, constraints: CreativeConstraints) { const violations = [constraints.maxCredits !== undefined && candidate.credits > constraints.maxCredits ? `Credits exceed ${constraints.maxCredits}` : '', constraints.allowAI === false && candidate.usesAI ? 'AI is forbidden' : '', constraints.preserveFace && candidate.changes.includes('face') ? 'Face must be preserved' : '', constraints.preserveClothing && candidate.changes.includes('clothing') ? 'Clothing must be preserved' : '', constraints.preserveBrand && candidate.changes.includes('brand') ? 'Brand must be preserved' : ''].filter(Boolean); return directorImmutable({ valid: violations.length === 0, violations }); }
}

export interface ProjectVisualIdentity { readonly scope: DirectorScope; readonly mood: readonly string[]; readonly palette: readonly string[]; readonly lighting: readonly string[]; readonly composition: readonly string[]; readonly style: readonly string[]; readonly revision: number }
export class ProjectVisualMemory {
  constructor(private readonly identities: Readonly<Record<string, ProjectVisualIdentity>> = {}) {}
  save(identity: ProjectVisualIdentity) { const key = scopeKey(identity.scope); return new ProjectVisualMemory(directorImmutable({ ...this.identities, [key]: { ...identity, mood: [...identity.mood], palette: [...identity.palette], lighting: [...identity.lighting], composition: [...identity.composition], style: [...identity.style] } })); }
  get(scope: DirectorScope) { return this.identities[scopeKey(scope)]; }
}

export interface DirectorCandidate { readonly id: string; readonly scope: DirectorScope; readonly credits: number; readonly usesAI: boolean; readonly beauty: number; readonly simplicity: number; readonly overload: number; readonly ideaClarity: number; readonly brandAlignment: number; readonly composition: number }
export interface DirectorReviewItem { readonly question: string; readonly answer: boolean; readonly reason: string; readonly confidence: number; readonly recommendation: string }
export class CreativeDirectorReview {
  review(candidate: DirectorCandidate, alternatives: readonly DirectorCandidate[]): readonly DirectorReviewItem[] { if (alternatives.some(item => scopeKey(item.scope) !== scopeKey(candidate.scope))) throw new Error('Review alternatives must share scope'); const cheaper = alternatives.find(item => item.credits < candidate.credits), prettier = alternatives.find(item => item.beauty > candidate.beauty); return directorImmutable([
    { question: 'Можно дешевле?', answer: Boolean(cheaper), reason: cheaper ? `${cheaper.id} costs less` : 'No cheaper alternative', confidence: .9, recommendation: cheaper ? `Consider ${cheaper.id}` : 'Keep cost' },
    { question: 'Можно красивее?', answer: Boolean(prettier), reason: prettier ? `${prettier.id} has higher beauty` : 'Best beauty available', confidence: .85, recommendation: prettier ? `Consider ${prettier.id}` : 'Keep visual direction' },
    { question: 'Можно проще?', answer: candidate.simplicity < .6, reason: `Simplicity ${candidate.simplicity}`, confidence: .8, recommendation: candidate.simplicity < .6 ? 'Remove secondary elements' : 'Keep structure' },
    { question: 'Можно без AI?', answer: candidate.usesAI && candidate.beauty < .8, reason: candidate.usesAI ? 'AI contribution reviewed' : 'Already local', confidence: .8, recommendation: candidate.usesAI && candidate.beauty < .8 ? 'Test local alternative' : 'Keep mode' },
    { question: 'Не перегружено?', answer: candidate.overload <= .4, reason: `Overload ${candidate.overload}`, confidence: .9, recommendation: candidate.overload > .4 ? 'Simplify' : 'Balanced' },
    { question: 'Не потерялась главная идея?', answer: candidate.ideaClarity >= .7, reason: `Idea clarity ${candidate.ideaClarity}`, confidence: .9, recommendation: candidate.ideaClarity < .7 ? 'Restore focal idea' : 'Preserve idea' },
    { question: 'Сохранился ли стиль бренда?', answer: candidate.brandAlignment >= .75, reason: `Brand alignment ${candidate.brandAlignment}`, confidence: .9, recommendation: candidate.brandAlignment < .75 ? 'Align with Brand DNA' : 'Brand preserved' },
    { question: 'Достаточно ли выразительна композиция?', answer: candidate.composition >= .7, reason: `Composition ${candidate.composition}`, confidence: .85, recommendation: candidate.composition < .7 ? 'Strengthen hierarchy' : 'Composition is expressive' },
  ]); }
}

export type DirectorExpertDomain = 'Composition' | 'Lighting' | 'Color' | 'Emotion' | 'Brand' | 'Cost' | 'Quality' | 'Narrative';
export interface DirectorExpertAssessment { readonly expert: string; readonly domain: DirectorExpertDomain; readonly score: number; readonly confidence: number; readonly reason: string }
export interface DirectorExpert { readonly name: string; readonly domain: DirectorExpertDomain; evaluate(signals: Readonly<Record<string, number>>): DirectorExpertAssessment }
export class HeuristicDirectorExpert implements DirectorExpert {
  constructor(readonly name: string, readonly domain: DirectorExpertDomain, private readonly signal: string, private readonly inverse = false) {}
  evaluate(signals: Readonly<Record<string, number>>) { const raw = clamp(signals[this.signal] ?? 0), score = this.inverse ? 1 - raw : raw; return directorImmutable({ expert: this.name, domain: this.domain, score: round(score), confidence: .8, reason: `${this.domain} evaluated ${this.signal}` }); }
}
export class CreativeExpertCouncil {
  constructor(private readonly experts: readonly DirectorExpert[]) {}
  evaluate(signals: Readonly<Record<string, number>>) { const assessments = this.experts.map(expert => expert.evaluate(signals)); const score = assessments.length ? assessments.reduce((sum, item) => sum + item.score * item.confidence, 0) / assessments.reduce((sum, item) => sum + item.confidence, 0) : 0; return directorImmutable({ score: round(score), assessments }); }
}

export interface CreativeScorecardInput { readonly luxury: number; readonly emotion: number; readonly composition: number; readonly narrative: number; readonly brand: number; readonly consistency: number; readonly creativity: number; readonly commercialValue: number; readonly technicalQuality: number; readonly tasteAlignment: number; readonly costEfficiency: number }
export class CreativeScorecard {
  create(input: CreativeScorecardInput) { const normalized = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, clamp(value)])) as unknown as CreativeScorecardInput; return directorImmutable({ ...normalized, overall: round(mean(Object.values(normalized))) }); }
}
export class CreativeIQ {
  evaluate(scorecard: CreativeScorecardInput & { overall?: number }, review: readonly DirectorReviewItem[], expertScore: number) { const corrective = /^(Consider|Simplify|Test|Restore|Align|Strengthen|Remove)/; const reviewScore = mean(review.map(item => corrective.test(item.recommendation) ? 1 - item.confidence : item.confidence)); const score = round(100 * clamp((scorecard.composition + scorecard.narrative + scorecard.brand + scorecard.creativity + scorecard.commercialValue) / 5 * .6 + reviewScore * .2 + expertScore * .2)); return directorImmutable({ score, level: score >= 85 ? 'EXPERT' : score >= 70 ? 'SENIOR' : score >= 50 ? 'DEVELOPING' : 'BASIC', explanation: { artisticJudgment: round((scorecard.composition + scorecard.narrative + scorecard.creativity) / 3), reviewDiscipline: round(reviewScore), expertAgreement: clamp(expertScore) } }); }
}

export type StyleGenomeVector = Readonly<{ lighting: number; composition: number; color: number; texture: number; contrast: number; palette: number; perspective: number; emotion: number }>;
export class StyleGenome {
  encode(input: StyleGenomeVector) { const entries = Object.entries(input), total = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0); let allocated = 0; const normalized = Object.fromEntries(entries.map(([key, value], index) => { const weight = index === entries.length - 1 && total ? round(1 - allocated) : round(total ? Math.max(0, value) / total : 0); allocated += weight; return [key, weight]; })) as StyleGenomeVector; return directorImmutable(normalized); }
  distance(left: StyleGenomeVector, right: StyleGenomeVector) { return round(Math.sqrt(Object.keys(left).reduce((sum, key) => sum + (left[key as keyof StyleGenomeVector] - right[key as keyof StyleGenomeVector]) ** 2, 0))); }
}

export interface ReasoningContext { readonly scope: DirectorScope; readonly prompt: string; readonly signals: Readonly<Record<string, number>> }
export interface CreativeReasoningResult { readonly recommendation: string; readonly confidence: number; readonly reasons: readonly string[] }
export interface CreativeReasoner { reason(context: ReasoningContext): CreativeReasoningResult }
export interface CreativePlanner { plan(result: CreativeReasoningResult): readonly string[] }
export interface CreativeCritic { critique(result: CreativeReasoningResult): readonly string[] }
export interface CreativeDirector { direct(context: ReasoningContext): CreativeReasoningResult }
export interface CreativeVisionModel { create(scope: DirectorScope, prompt: string): CreativeVision }
export interface CreativeStyleEncoder { encode(style: Readonly<Record<string, number>>): StyleGenomeVector }
export interface CreativeNarrativeEncoder { encode(narrative: CreativeNarrative): readonly number[] }
export interface CreativeEmotionEncoder { encode(emotion: EmotionProfile): readonly number[] }
export interface CreativeWorldModel { evaluate(context: ReasoningContext): Readonly<Record<string, number>> }
export interface CreativeImaginationEngine { imagine(context: ReasoningContext, count: number): readonly CreativeReasoningResult[] }

export class HeuristicCreativeReasoner implements CreativeReasoner {
  reason(context: ReasoningContext) { const entries = Object.entries(context.signals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), best = entries[0] ?? ['balanced', .5] as const; return directorImmutable({ recommendation: `Emphasize ${best[0]}`, confidence: round(clamp(best[1])), reasons: entries.slice(0, 3).map(([name, value]) => `${name}=${value}`) }); }
}
export class HeuristicCreativePlanner implements CreativePlanner { plan(result: CreativeReasoningResult) { return directorImmutable([...result.reasons.map(reason => `Apply ${reason}`), `Deliver ${result.recommendation}`]); } }
export class HeuristicCreativeCritic implements CreativeCritic { critique(result: CreativeReasoningResult) { return directorImmutable(result.confidence < .6 ? ['Confidence is low', 'Request stronger art direction'] : ['Direction is coherent']); } }
export class HeuristicCreativeDirector implements CreativeDirector { constructor(private readonly reasoner: CreativeReasoner) {} direct(context: ReasoningContext) { return this.reasoner.reason(context); } }
export class HeuristicCreativeStyleEncoder implements CreativeStyleEncoder { encode(style: Readonly<Record<string, number>>) { const keys = ['lighting', 'composition', 'color', 'texture', 'contrast', 'palette', 'perspective', 'emotion'] as const; return new StyleGenome().encode(Object.fromEntries(keys.map(key => [key, style[key] ?? 0])) as StyleGenomeVector); } }
export class HeuristicCreativeNarrativeEncoder implements CreativeNarrativeEncoder { encode(narrative: CreativeNarrative) { return directorImmutable([round(clamp(narrative.arc.length / 6)), narrative.confidence]); } }
export class HeuristicCreativeEmotionEncoder implements CreativeEmotionEncoder { encode(emotion: EmotionProfile) { return directorImmutable([...Object.entries(emotion.emotions).sort().map(([, value]) => value), emotion.confidence]); } }
export class HeuristicCreativeWorldModel implements CreativeWorldModel { evaluate(context: ReasoningContext) { return directorImmutable(Object.fromEntries(Object.entries(context.signals).sort().map(([key, value]) => [key, clamp(value)]))); } }
export class HeuristicCreativeImaginationEngine implements CreativeImaginationEngine {
  constructor(private readonly dependencies: DirectorDependencies, private readonly reasoner: CreativeReasoner) {}
  imagine(context: ReasoningContext, count: number) { return directorImmutable(Array.from({ length: Math.max(0, count) }, (_, index) => { const variation = round(clamp(this.dependencies.random() * .1 + index * .01)); const result = this.reasoner.reason({ ...context, signals: { ...context.signals, imagination: variation } }); return { ...result, recommendation: `${result.recommendation} #${this.dependencies.id()}`, reasons: [...result.reasons, `createdAt=${this.dependencies.clock()}`] }; })); }
}

export class CreativeDirectorDebugger {
  trace(values: Partial<Record<string, unknown>>) { const names = ['Prompt', 'Vision', 'Emotion', 'Narrative', 'Visual Language', 'Composition', 'Brand Identity', 'Constraints', 'Experts', 'Director Review', 'Creative Scorecard', 'Creative IQ', 'Reasoning', 'Recommendation']; const stages = names.map(name => ({ name, value: values[name] ?? null })); return directorImmutable({ version: 1, stages, text: stages.map(stage => `${stage.name}: ${JSON.stringify(stage.value)}`).join('\n') }); }
}
