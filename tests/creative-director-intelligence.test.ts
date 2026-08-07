import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  BrandIdentityEngine, ColorPsychologyEngine, CompositionExpert,
  CreativeConsistencyEngine, CreativeConstraintEngine, CreativeDirectorDebugger,
  CreativeDirectorReview, CreativeDiversityEngine, CreativeEmotionEngine,
  CreativeExpertCouncil, CreativeIQ, CreativeInspirationEngine,
  CreativeNarrativeEngine, CreativeScorecard, CreativeVisionEngine,
  HeuristicCreativeCritic, HeuristicCreativeDirector, HeuristicCreativeEmotionEncoder,
  HeuristicCreativeImaginationEngine, HeuristicCreativeNarrativeEncoder,
  HeuristicCreativePlanner, HeuristicCreativeReasoner, HeuristicCreativeStyleEncoder,
  HeuristicCreativeWorldModel, HeuristicDirectorExpert, LightingPsychologyEngine,
  ProjectVisualMemory, StyleEvolutionEngine, StyleGenome, VisualLanguageEngine,
} from '../src/platform/creative/decision/intelligence/director';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const dependencies = () => { let id = 0; return { id: () => `id-${++id}`, clock: () => 42, random: () => .25 }; };
const composition = { hierarchy: .8, balance: .8, focus: .9, negativeSpace: .7, rhythm: .6, perspective: .7, symmetry: .8, ruleOfThirds: .9 };

test('creative vision transforms a request into complete art direction', () => {
  const vision = new CreativeVisionEngine(dependencies()).create(scope, 'Сделай дорогое фото товара для каталога');
  assert.ok(vision.style.includes('Luxury')); assert.ok(vision.style.includes('Catalog')); assert.ok(vision.mood.includes('Warm'));
  assert.equal(vision.commercialIntent, 'Conversion'); assert.deepEqual(vision.visualDirection, ['Soft lighting', 'Warm palette', 'Clean background']);
});

test('vision IDs and time are injected and results are deterministic', () => {
  const first = new CreativeVisionEngine({ id: () => 'vision', clock: () => 1, random: () => .5 }).create(scope, 'luxury');
  const second = new CreativeVisionEngine({ id: () => 'vision', clock: () => 1, random: () => .5 }).create(scope, 'luxury');
  assert.deepEqual(first, second); assert.equal(first.id, 'vision'); assert.equal(first.createdAt, 1);
});

test('visual language maps luxury and fashion to weighted devices', () => {
  const engine = new VisualLanguageEngine();
  assert.equal(engine.get('Luxury')?.devices['Soft lighting'], .95);
  assert.equal(engine.get('Fashion')?.devices['Editorial composition'], .95);
  assert.ok(engine.combine(['Luxury', 'Fashion']).confidence > .8);
});

test('visual languages use persistent immutable updates', () => {
  const empty = new VisualLanguageEngine([]), added = empty.add({ name: 'Test', devices: { Light: 1 }, confidence: 2 });
  assert.equal(empty.get('Test'), undefined); assert.equal(added.get('Test')?.confidence, 1); assert.throws(() => ((added.get('Test')!.devices as any).Light = 0));
});

test('emotion engine derives emotional recommendations from vision', () => {
  const vision = new CreativeVisionEngine(dependencies()).create(scope, 'luxury premium');
  const emotion = new CreativeEmotionEngine().analyze(vision);
  assert.ok(emotion.emotions.Luxury > 0); assert.ok(emotion.recommendations.includes('soft light'));
});

test('narrative engine creates a status-confidence-success arc', () => {
  const vision = new CreativeVisionEngine(dependencies()).create(scope, 'luxury car');
  assert.deepEqual(new CreativeNarrativeEngine().build('Luxury Car', vision).arc, ['Luxury Car', 'Status', 'Confidence', 'Success']);
});

test('composition expert evaluates all eight artistic dimensions', () => {
  const result = new CompositionExpert().evaluate(composition);
  assert.equal(result.domain, 'Composition'); assert.ok(result.score > .7); assert.equal(result.weaknesses.length, 0);
});

test('composition expert explains weaknesses', () => {
  const result = new CompositionExpert().evaluate({ ...composition, hierarchy: .1, focus: .2 });
  assert.deepEqual(result.weaknesses, ['focus', 'hierarchy']); assert.match(result.recommendation, /focus/);
});

test('color psychology maps color to perception both ways', () => {
  const colors = new ColorPsychologyEngine();
  assert.deepEqual(colors.meanings('Gold'), ['Luxury', 'Prestige']); assert.deepEqual(colors.recommend('Trust'), ['Blue']); assert.deepEqual(colors.meanings('unknown'), []);
});

test('lighting psychology maps light character to perception', () => {
  const lighting = new LightingPsychologyEngine();
  assert.deepEqual(lighting.meanings('Soft'), ['Luxury', 'Gentle']); assert.deepEqual(lighting.recommend('Technology'), ['Cold']);
});

test('brand identity is project-owned and independent from user', () => {
  const brand = { projectId: 'project', preferredPalette: ['Black'], preferredMood: ['Premium'], preferredLighting: ['Soft'], preferredStyle: ['Luxury'], consistencyRules: ['preserve logo'] };
  const engine = new BrandIdentityEngine().set(brand);
  assert.equal(engine.get('project')?.preferredStyle[0], 'Luxury'); assert.equal(engine.alignment('project', { palette: ['Black'], mood: ['Premium'], lighting: ['Soft'], style: ['Luxury'] }), 1);
});

test('style evolution produces chronological transitions', () => {
  const result = new StyleEvolutionEngine().analyze([{ scope, timestamp: 3, style: 'Editorial', strength: .9 }, { scope, timestamp: 1, style: 'Minimal', strength: .5 }, { scope, timestamp: 2, style: 'Luxury', strength: .7 }]);
  assert.deepEqual(result.path, ['Minimal', 'Luxury', 'Editorial']); assert.equal(result.current, 'Editorial');
});

test('style evolution rejects mixed user history', () => {
  assert.throws(() => new StyleEvolutionEngine().analyze([{ scope, timestamp: 1, style: 'A', strength: 1 }, { scope: { ...scope, userId: 'other' }, timestamp: 2, style: 'B', strength: 1 }]), /one scope/);
});

test('consistency engine evaluates a coherent image series', () => {
  const items = [{ id: 'a', scope, features: { warmth: .8, contrast: .7 } }, { id: 'b', scope, features: { warmth: .82, contrast: .68 } }];
  assert.ok(new CreativeConsistencyEngine().evaluate(items).score > .95);
});

test('consistency and diversity reject cross-scope series', () => {
  const items = [{ id: 'a', scope, features: {} }, { id: 'b', scope: { ...scope, tenantId: 'other' }, features: {} }];
  assert.throws(() => new CreativeConsistencyEngine().evaluate(items), /one scope/); assert.throws(() => new CreativeDiversityEngine().evaluate(items), /one scope/);
});

test('diversity rewards visually distinct candidates', () => {
  const same = [{ id: 'a', scope, features: { x: 0 } }, { id: 'b', scope, features: { x: 0 } }], diverse = [{ id: 'a', scope, features: { x: 0 } }, { id: 'b', scope, features: { x: 1 } }];
  assert.ok(new CreativeDiversityEngine().evaluate(diverse).score > new CreativeDiversityEngine().evaluate(same).score);
});

test('inspiration combines styles into a deterministic new direction', () => {
  const result = new CreativeInspirationEngine().combine(['Luxury', 'Minimal'], () => 0);
  assert.equal(result.name, 'Luxury Minimal'); assert.deepEqual(result.sources, ['Luxury', 'Minimal']); assert.match(result.explanation, /Luxury \+ Minimal/);
});

test('constraint engine understands credits AI and preservation', () => {
  const result = new CreativeConstraintEngine().validate({ credits: 10, usesAI: true, changes: ['face', 'brand'] }, { maxCredits: 5, allowAI: false, preserveFace: true, preserveBrand: true });
  assert.equal(result.valid, false); assert.equal(result.violations.length, 4);
});

test('project visual memory is immutable and fully scoped', () => {
  const identity = { scope, mood: ['Premium'], palette: ['Black'], lighting: ['Soft'], composition: ['Balanced'], style: ['Luxury'], revision: 1 };
  const empty = new ProjectVisualMemory(), saved = empty.save(identity);
  assert.equal(empty.get(scope), undefined); assert.deepEqual(saved.get(scope)?.palette, ['Black']); assert.equal(saved.get({ ...scope, userId: 'other' }), undefined);
  assert.throws(() => (saved.get(scope)!.palette as any).push('Gold'));
});

const candidate = (overrides = {}) => ({ id: 'main', scope, credits: 10, usesAI: true, beauty: .7, simplicity: .5, overload: .6, ideaClarity: .6, brandAlignment: .6, composition: .6, ...overrides });
test('director review answers all eight internal review questions', () => {
  const review = new CreativeDirectorReview().review(candidate(), [candidate({ id: 'local', credits: 0, usesAI: false, beauty: .8 })]);
  assert.equal(review.length, 8); assert.ok(review.every(item => item.reason && item.recommendation && item.confidence > 0)); assert.equal(review[0].answer, true);
});

test('director review never compares candidates from another scope', () => {
  assert.throws(() => new CreativeDirectorReview().review(candidate(), [candidate({ scope: { ...scope, projectId: 'other' } })]), /share scope/);
});

test('expert council aggregates eight domain-only experts', () => {
  const domains = ['Composition', 'Lighting', 'Color', 'Emotion', 'Brand', 'Cost', 'Quality', 'Narrative'] as const;
  const council = new CreativeExpertCouncil(domains.map(domain => new HeuristicDirectorExpert(`${domain} Expert`, domain, domain.toLowerCase(), domain === 'Cost')));
  const result = council.evaluate(Object.fromEntries(domains.map(domain => [domain.toLowerCase(), .8])));
  assert.equal(result.assessments.length, 8); assert.deepEqual(result.assessments.map(item => item.domain), domains); assert.ok(result.score > 0);
});

test('creative scorecard contains eleven normalized dimensions', () => {
  const scorecard = new CreativeScorecard().create({ luxury: 2, emotion: .8, composition: .8, narrative: .7, brand: .9, consistency: .8, creativity: .9, commercialValue: .8, technicalQuality: .9, tasteAlignment: .8, costEfficiency: .7 });
  assert.equal(scorecard.luxury, 1); assert.equal(Object.keys(scorecard).length, 12); assert.ok(scorecard.overall <= 1);
});

test('Creative IQ describes art-director maturity', () => {
  const scorecard = new CreativeScorecard().create({ luxury: .9, emotion: .9, composition: .9, narrative: .9, brand: .9, consistency: .9, creativity: .9, commercialValue: .9, technicalQuality: .9, tasteAlignment: .9, costEfficiency: .9 });
  const review = new CreativeDirectorReview().review(candidate({ usesAI: false, simplicity: .9, overload: .1, ideaClarity: .9, brandAlignment: .9, composition: .9 }), []);
  const iq = new CreativeIQ().evaluate(scorecard, review, .9); assert.ok(iq.score >= 85); assert.equal(iq.level, 'EXPERT');
});

test('style genome normalizes eight artistic genes', () => {
  const genome = new StyleGenome().encode({ lighting: 2, composition: 1, color: 1, texture: 1, contrast: 1, palette: 1, perspective: 1, emotion: 1 });
  assert.equal(Object.keys(genome).length, 8); assert.ok(Math.abs(Object.values(genome).reduce((sum, value) => sum + value, 0) - 1) < 1e-12); assert.equal(new StyleGenome().distance(genome, genome), 0);
});

test('reasoning foundation implementations compose without API coupling', () => {
  const context = { scope, prompt: 'premium', signals: { luxury: .9, simplicity: .6 } }, reasoner = new HeuristicCreativeReasoner(), result = new HeuristicCreativeDirector(reasoner).direct(context);
  assert.equal(result.recommendation, 'Emphasize luxury'); assert.ok(new HeuristicCreativePlanner().plan(result).length); assert.deepEqual(new HeuristicCreativeCritic().critique(result), ['Direction is coherent']);
  assert.deepEqual(new HeuristicCreativeWorldModel().evaluate(context), { luxury: .9, simplicity: .6 });
});

test('style narrative and emotion encoders are deterministic', () => {
  const style = new HeuristicCreativeStyleEncoder().encode({ lighting: 1, color: 1 }), vision = new CreativeVisionEngine(dependencies()).create(scope, 'portrait'), narrative = new CreativeNarrativeEngine().build('Person', vision), emotion = new CreativeEmotionEngine().analyze(vision);
  assert.equal(Object.values(style).reduce((sum, value) => sum + value, 0), 1); assert.deepEqual(new HeuristicCreativeNarrativeEncoder().encode(narrative), new HeuristicCreativeNarrativeEncoder().encode(narrative)); assert.deepEqual(new HeuristicCreativeEmotionEncoder().encode(emotion), new HeuristicCreativeEmotionEncoder().encode(emotion));
});

test('imagination receives random ID and time solely through DI', () => {
  const imagination = new HeuristicCreativeImaginationEngine({ id: () => 'imagined', clock: () => 99, random: () => .5 }, new HeuristicCreativeReasoner());
  const results = imagination.imagine({ scope, prompt: 'new', signals: { creative: .8 } }, 2);
  assert.equal(results.length, 2); assert.ok(results.every(item => item.recommendation.endsWith('#imagined'))); assert.ok(results.every(item => item.reasons.includes('createdAt=99')));
});

test('debugger exposes the full creative director chain', () => {
  const trace = new CreativeDirectorDebugger().trace({ Prompt: 'luxury', Recommendation: 'soft light' });
  assert.deepEqual(trace.stages.map(stage => stage.name), ['Prompt', 'Vision', 'Emotion', 'Narrative', 'Visual Language', 'Composition', 'Brand Identity', 'Constraints', 'Experts', 'Director Review', 'Creative Scorecard', 'Creative IQ', 'Reasoning', 'Recommendation']); assert.match(trace.text, /Creative IQ/);
});

test('all returned nested data is deeply immutable', () => {
  const vision = new CreativeVisionEngine(dependencies()).create(scope, 'luxury');
  assert.equal(Object.isFrozen(vision), true); assert.equal(Object.isFrozen(vision.scope), true); assert.equal(Object.isFrozen(vision.style), true); assert.throws(() => (vision.style as any).push('x'));
});

test('director layer has no forbidden imports and does not import Decision Core', () => {
  const directory = 'src/platform/creative/decision/intelligence/director', forbidden = [/application/i, /memory/i, /workflow/i, /runtime/i, /gateway/i, /provider/i, /billing/i, /react/i, /browser/i, /editing/i, /pipeline/i, /\.\.\/core/];
  for (const file of readdirSync(directory)) { if (!file.endsWith('.ts')) continue; const imports = readFileSync(join(directory, file), 'utf8').split('\n').filter(line => /^import|^export .* from/.test(line)).join('\n'); for (const pattern of forbidden) assert.equal(pattern.test(imports), false, `${file}: ${pattern}`); }
});
