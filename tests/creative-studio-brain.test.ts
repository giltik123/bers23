import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  ConsensusEngine, CreativeIdentityEngine, CreativeIQ2, CreativeMetrics,
  CreativePrinciplesEngine, CreativeStudioBrain, CreativeTasteSpace,
  DebateEngine, DirectorMemory, DirectorTimeline, HeuristicDirectorModel,
  HeuristicLearningModel, HeuristicReasoningModel, HeuristicTasteModel,
  HeuristicTradeoffModel, HeuristicWorldModel, IndependentStudioExpert,
  StrategyEvolution, StudioDebugger, StudioKnowledgeBase, StudioReplay,
  StyleVectorEncoder, VisualLaws, createDefaultStudioExperts,
} from '../src/platform/creative/studio-brain';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const sequence = () => { let id = 0; return () => `id-${++id}`; };
const context = Object.freeze({ scope, prompt: 'luxury catalog with premium quality', intent: ['Luxury', 'Catalog'], goals: ['sell'], constraints: { credits: 5 } });
const dependencies = () => ({ id: sequence(), clock: () => 100, random: () => .25 });

test('default studio contains ten independent specialists', () => {
  const experts = createDefaultStudioExperts(sequence());
  assert.equal(experts.length, 10);
  assert.deepEqual(experts.map(expert => expert.name), ['Creative Director', 'Art Director', 'Brand Director', 'Lighting Director', 'Composition Director', 'Fashion Director', 'Marketing Director', 'Cost Director', 'AI Director', 'Quality Director']);
});

test('each expert returns a complete independent opinion', () => {
  const opinions = createDefaultStudioExperts(sequence()).map(expert => expert.opine(context));
  assert.ok(opinions.every(opinion => opinion.recommendation && opinion.reason));
  assert.ok(opinions.every(opinion => opinion.operations.length && opinion.risks.length));
  assert.ok(opinions.every(opinion => opinion.expectedQuality >= 0 && opinion.expectedCost >= 0));
  assert.equal(new Set(opinions.map(opinion => opinion.id)).size, 10);
});

test('experts see the same context but do not communicate', () => {
  const id = sequence(), expert = new IndependentStudioExpert('Lighting', 'lighting', { id }, { keywords: ['luxury'], recommendation: 'soft light', operations: ['light'], risks: ['flat'], quality: .8, cost: 0 });
  assert.deepEqual(expert.opine(context).operations, ['light']);
  assert.equal((expert as any).peers, undefined);
});

test('debate preserves every opinion and injected metadata', () => {
  const deps = dependencies(), opinions = createDefaultStudioExperts(deps.id).map(expert => expert.opine(context));
  const debate = new DebateEngine(deps).debate(scope, opinions);
  assert.equal(debate.opinions.length, 10); assert.equal(debate.createdAt, 100); assert.ok(debate.positions.length > 0);
});

test('consensus separates accepted minority and rejected ideas', () => {
  const deps = dependencies(), base = { reason: 'reason', risks: [], expectedQuality: .8, expectedCost: 0 };
  const opinions = [
    { id: '1', expert: 'A', domain: 'x', recommendation: 'a', confidence: 1, operations: ['local'], ...base },
    { id: '2', expert: 'B', domain: 'x', recommendation: 'b', confidence: 1, operations: ['local'], ...base },
    { id: '3', expert: 'C', domain: 'x', recommendation: 'c', confidence: .1, operations: ['ai'], ...base },
  ];
  const result = new ConsensusEngine().build(new DebateEngine(deps).debate(scope, opinions));
  assert.deepEqual(result.acceptedIdeas, ['local']); assert.ok([...result.minorityOpinion, ...result.rejectedIdeas].includes('ai'));
});

test('director memory learns scoped strategy sequences', () => {
  const outcomes = Array.from({ length: 10 }, (_, index) => ({ scope, intent: 'Luxury Catalog', operations: ['LOCAL', 'LIGHT', 'COLOR', 'AI', 'FINAL'], accepted: index < 9, quality: .9, satisfaction: .9 }));
  const pattern = new DirectorMemory().learn(outcomes)[0];
  assert.equal(pattern.frequency, 10); assert.equal(pattern.successRate, .9); assert.deepEqual(pattern.operations, ['LOCAL', 'LIGHT', 'COLOR', 'AI', 'FINAL']);
});

test('director memory never merges scopes', () => {
  const records = [{ scope, intent: 'A', operations: ['x'], accepted: true, quality: 1, satisfaction: 1 }, { scope: { ...scope, userId: 'other' }, intent: 'A', operations: ['x'], accepted: false, quality: 0, satisfaction: 0 }];
  assert.equal(new DirectorMemory().learn(records).length, 2);
});

test('creative principles are weighted persistent knowledge', () => {
  const empty = new CreativePrinciplesEngine(), library = empty.add({ id: 'luxury', domain: 'Luxury', guidance: ['soft light'], priority: .9, weight: .8, confidence: .9, support: 50 });
  assert.equal(empty.forDomain('Luxury').length, 0); assert.deepEqual(library.forDomain('Luxury')[0].guidance, ['soft light']);
});

test('visual laws evaluate eleven universal laws separately', () => {
  const result = new VisualLaws().evaluate({ 'Rule of Thirds': .9, Focus: .8, Balance: .7 });
  assert.equal(result.laws.length, 11); assert.equal(result.laws.find(law => law.name === 'Focus')?.score, .8);
});

test('tradeoff solver handles quality cost and balanced cases', () => {
  const solver = new HeuristicTradeoffModel();
  assert.equal(solver.solve({ name: 'quality', value: 1, priority: 1 }, { name: 'cost', value: .2, priority: .5 }).winner, 'quality');
  assert.equal(solver.solve({ name: 'brand', value: .8, priority: .8 }, { name: 'emotion', value: .8, priority: .8 }).winner, 'BALANCED');
});

test('creative taste is a coordinate space rather than a list', () => {
  const space = new CreativeTasteSpace(), luxury = space.normalize({ Luxury: 1, Minimal: .5 });
  assert.deepEqual(luxury, { Luxury: 1, Minimal: .5 }); assert.equal(space.distance(luxury, luxury), 0);
  assert.equal(space.nearest(luxury, { same: luxury, dark: { Dark: 1 } })[0].name, 'same');
});

test('style encoder produces deterministic 128 and 256 dimensional vectors', () => {
  const encoder = new StyleVectorEncoder(), a = encoder.encode(scope, { Luxury: .9, Minimal: .4 }), b = encoder.encode(scope, { Luxury: .9, Minimal: .4 });
  assert.equal(a.dimensions.length, 128); assert.deepEqual(a, b); assert.equal(encoder.encode(scope, { Luxury: 1 }, 256).dimensions.length, 256);
});

test('creative identity keeps creative visual editing and AI identities separate', () => {
  const engine = new CreativeIdentityEngine(), identity = engine.create(scope, { creative: { novelty: .8 }, visual: { luxury: .9 }, editing: { local: .7 }, ai: { trust: .3 } });
  assert.equal(identity.revision, 1); assert.equal(identity.ai.trust, .3); assert.equal(identity.visual.luxury, .9);
  const evolved = engine.evolve(identity, { ai: { trust: 1 } }, .1); assert.equal(evolved.revision, 2); assert.equal(evolved.ai.trust, .37); assert.equal(identity.ai.trust, .3);
});

test('strategy evolution tracks versions and identifies the best', () => {
  const deps = dependencies(), v1 = new StrategyEvolution(deps).evolve('Luxury', ['light'], .7, 10), first = v1.history('Luxury')[0], v2 = v1.evolve('Luxury', ['light', 'color'], .9, 20, first.id);
  assert.deepEqual(v2.history('Luxury').map(item => item.version), [1, 2]); assert.equal(v2.best('Luxury')?.version, 2);
});

test('studio knowledge base retrieves platform knowledge by concepts', () => {
  const knowledge = new StudioKnowledgeBase().add({ id: '1', concepts: ['Luxury', 'Soft Light', 'Warm Color'], outcome: 'High satisfaction', confidence: .9, support: 100 });
  assert.equal(knowledge.query(['Luxury', 'Warm Color'])[0].fact.outcome, 'High satisfaction'); assert.equal(knowledge.query(['Portrait']).length, 0);
});

test('creative metrics contains eleven studio metrics', () => {
  const metrics = new CreativeMetrics().evaluate({ beauty: .9, luxury: .9, brand: .8, composition: .8, lighting: .9, color: .8, emotion: .7, commercial: .9, consistency: .8, innovation: .7, aiEfficiency: 2 });
  assert.equal(metrics.aiEfficiency, 1); assert.equal(Object.keys(metrics).length, 12); assert.ok(metrics.overall > .7);
});

test('Creative IQ 2.0 returns a profile not one opaque number', () => {
  const result = new CreativeIQ2().evaluate({ reasoningIQ: .9, planningIQ: .8, compositionIQ: .7, styleIQ: .9, brandIQ: .8, economyIQ: .6, learningIQ: .7, creativeIQ: .95 });
  assert.equal(Object.keys(result.profile).length, 8); assert.ok(result.strengths.includes('reasoningIQ')); assert.ok(result.overall > 0);
});

test('studio replay captures the whole expert discussion', () => {
  const deps = dependencies(), opinions = createDefaultStudioExperts(deps.id).slice(0, 2).map(expert => expert.opine(context)), debate = new DebateEngine(deps).debate(scope, opinions), consensus = new ConsensusEngine().build(debate);
  const replay = new StudioReplay().capture(debate, consensus, { operations: ['local'] });
  assert.deepEqual(replay.frames.map(frame => frame.kind), ['OPINION', 'OPINION', 'DEBATE', 'CONSENSUS', 'DECISION']);
});

test('director timeline records platform brain evolution', () => {
  const timeline = new DirectorTimeline().add({ id: '2', timestamp: 2, kind: 'strategy', value: 'v2' }).add({ id: '1', timestamp: 1, kind: 'principle', value: 'Luxury' });
  assert.deepEqual(timeline.history().map(event => event.id), ['1', '2']); assert.deepEqual(timeline.history('strategy').map(event => event.value), ['v2']);
});

test('future model contracts have replaceable heuristic implementations', () => {
  const opinions = createDefaultStudioExperts(sequence()).map(expert => expert.opine(context));
  assert.ok(new HeuristicReasoningModel().reason(context, opinions).recommendation);
  assert.deepEqual(new HeuristicTasteModel().encode({ Luxury: 2 }), { Luxury: 1 });
  assert.ok(new HeuristicWorldModel().evaluate(context).promptComplexity > 0);
  assert.equal(new HeuristicLearningModel().learn([{ scope, intent: 'A', operations: ['x'], accepted: true, quality: 1, satisfaction: 1 }]).length, 1);
});

test('Creative Studio Brain runs opinions debate consensus and decision', () => {
  const deps = dependencies(), brain = new CreativeStudioBrain(createDefaultStudioExperts(deps.id), new DebateEngine(deps), new ConsensusEngine(), new HeuristicTradeoffModel(), new HeuristicDirectorModel());
  const result = brain.think(context);
  assert.equal(result.opinions.length, 10); assert.ok(result.debate.positions.length); assert.ok(result.decision.operations.length); assert.ok(result.expectedResult.quality > 0);
});

test('Studio Brain output is deterministic with deterministic DI', () => {
  const build = () => { const deps = dependencies(); return new CreativeStudioBrain(createDefaultStudioExperts(deps.id), new DebateEngine(deps), new ConsensusEngine(), new HeuristicTradeoffModel(), new HeuristicDirectorModel()).think(context); };
  assert.deepEqual(build(), build());
});

test('Studio Brain output is deeply immutable', () => {
  const deps = dependencies(), result = new CreativeStudioBrain(createDefaultStudioExperts(deps.id), new DebateEngine(deps), new ConsensusEngine(), new HeuristicTradeoffModel(), new HeuristicDirectorModel()).think(context);
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.opinions), true); assert.equal(Object.isFrozen(result.context.scope), true); assert.throws(() => (result.opinions as any).push({}));
});

test('Studio debugger contains the complete required chain', () => {
  const trace = new StudioDebugger().trace({ Prompt: 'luxury', Decision: ['local'] });
  assert.deepEqual(trace.stages.map(stage => stage.name), ['Prompt', 'Intent', 'Goals', 'Experts', 'Debate', 'Consensus', 'Tradeoffs', 'Knowledge', 'Identity', 'Reasoning', 'Decision', 'Expected Result', 'Creative IQ']); assert.match(trace.text, /Consensus/);
});

test('studio brain has no forbidden infrastructure imports', () => {
  const directory = 'src/platform/creative/studio-brain', forbidden = [/workflow/i, /runtime/i, /provider/i, /billing/i, /gateway/i, /react/i, /browser/i, /application/i, /memory core/i, /openai/i];
  for (const file of readdirSync(directory)) { if (!file.endsWith('.ts')) continue; const imports = readFileSync(join(directory, file), 'utf8').split('\n').filter(line => /^import|^export .* from/.test(line)).join('\n'); for (const pattern of forbidden) assert.equal(pattern.test(imports), false, `${file}: ${pattern}`); }
});
