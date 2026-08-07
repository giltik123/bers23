import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  AdaptiveHeuristicEngine, CounterfactualDecisionEngine, CreativeCausalLearningEngine,
  CreativePrincipleLibrary, CreativeTimeline, DecisionBenchmarkSuite,
  DecisionCompressionEngine, DecisionEvolutionScore, DecisionExplainabilityV5,
  DecisionReflectionEngine, ExpertCouncil, ExplorationPolicy,
  HeuristicCreativeExpert, HeuristicDecisionDecoder, HeuristicDecisionEncoder,
  HeuristicDecisionInferenceSession, HeuristicDecisionLoss, HeuristicDecisionModel,
  HeuristicDecisionPolicy, HeuristicDecisionReward, HumanTasteModel,
  ImmutableDecisionReplayBuffer, KnowledgeEvolutionEngine,
} from '../src/platform/creative/decision/intelligence/core';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const sequence = (prefix = 'id') => { let value = 0; return () => `${prefix}-${++value}`; };
const metrics = (overrides = {}) => ({ quality: .8, cost: 5, latency: 100, risk: .2, probability: .9, satisfaction: .8, creativity: .6, ...overrides });

test('causal learning constructs an ordered cause-effect graph', () => {
  const id = sequence(), dependencies = { id, clock: () => 100 };
  const engine = new CreativeCausalLearningEngine(dependencies).learn({ scope, path: ['Lighting', 'Contrast', 'Luxury Feeling', 'Accepted'], successful: true });
  assert.deepEqual(engine.graph(scope).map(edge => [edge.cause, edge.effect]), [['Contrast', 'Luxury Feeling'], ['Lighting', 'Contrast'], ['Luxury Feeling', 'Accepted']]);
  assert.equal(engine.graph(scope)[0].support, 1);
});

test('causal strength incorporates support and counter evidence', () => {
  const dependencies = { id: sequence(), clock: () => 100 };
  const learned = new CreativeCausalLearningEngine(dependencies)
    .learn({ scope, path: ['Light', 'Success'], successful: true })
    .learn({ scope, path: ['Light', 'Success'], successful: true })
    .learn({ scope, path: ['Light', 'Success'], successful: false });
  const relation = learned.graph(scope)[0];
  assert.equal(relation.support, 2); assert.equal(relation.counterEvidence, 1); assert.equal(relation.causalStrength, .333333);
  assert.equal(learned.explain(scope, 'Light', 'Success').supported, true);
});

test('causal graphs are isolated by tenant project and user', () => {
  const dependencies = { id: sequence(), clock: () => 1 }, other = { ...scope, userId: 'other' };
  const learned = new CreativeCausalLearningEngine(dependencies).learn({ scope, path: ['A', 'B'], successful: true });
  assert.equal(learned.graph(other).length, 0);
});

test('counterfactual engine explains whether extra AI cost is justified', () => {
  const selected = { id: 'local', mode: 'LOCAL', quality: .89, credits: 0, latency: 100, satisfaction: .9, probability: 1 };
  const ai = { id: 'ai', mode: 'AI', quality: .92, credits: 10, latency: 1000, satisfaction: .91, probability: .9 };
  const result = new CounterfactualDecisionEngine().compare(selected, [ai])[0];
  assert.equal(result.qualityDelta, .03); assert.equal(result.creditDelta, 10); assert.equal(result.justified, false); assert.match(result.explanation, /not justified/);
});

test('counterfactual output is deterministic and immutable', () => {
  const engine = new CounterfactualDecisionEngine(), selected = { id: 'a', mode: 'A', quality: .5, credits: 0, latency: 1, satisfaction: .5, probability: 1 }, alternative = { ...selected, id: 'b', mode: 'B', quality: .9 };
  assert.deepEqual(engine.compare(selected, [alternative]), engine.compare(selected, [alternative]));
  assert.throws(() => (engine.compare(selected, [alternative]) as any).push({}));
});

test('principle library stores design knowledge independently of users', () => {
  const library = new CreativePrincipleLibrary().add({ id: 'luxury-light', domain: 'Luxury', recommendation: 'soft light', weight: .9, confidence: .8, source: 'design-practice', supportCount: 42 });
  assert.equal(library.forDomain('Luxury')[0].recommendation, 'soft light');
  assert.equal(library.forDomain('Luxury')[0].supportCount, 42);
});

test('principle library is persistent-style immutable', () => {
  const empty = new CreativePrincipleLibrary(), populated = empty.add({ id: 'catalog', domain: 'Catalog', recommendation: 'accurate colors', weight: 2, confidence: 2, source: 'expert', supportCount: 1.9 });
  assert.equal(empty.all().length, 0); assert.equal(populated.all()[0].weight, 1); assert.equal(populated.all()[0].supportCount, 1);
});

test('human taste stays separate from technical quality', () => {
  const result = new HumanTasteModel().evaluate([.99, .97], [{ dimension: 'warmth', value: 0, preferred: 1, weight: 1 }]);
  assert.equal(result.technicalQuality, 98); assert.equal(result.creativePreference, 0);
});

test('reflection explains help harm waste future options and removable AI', () => {
  const reflection = new DecisionReflectionEngine({ id: () => 'reflection', clock: () => 77 }).reflect({ scope, helpful: ['lighting'], harmful: ['noise'], useless: ['upscale'], alternatives: ['local contrast'], aiUsed: true, localQuality: .89, finalQuality: .9, credits: 10 });
  assert.equal(reflection.id, 'reflection'); assert.equal(reflection.createdAt, 77); assert.equal(reflection.canRemoveAI, true);
  assert.deepEqual(reflection.whatHelped, ['lighting']); assert.throws(() => (reflection.whatHelped as any).push('x'));
});

test('exploration policy supports exploit explore and balanced', () => {
  const policy = new ExplorationPolicy();
  assert.equal(policy.choose({ confidence: .1, experience: .1, risk: 0, noveltyNeed: 1, budgetPressure: 0 }), 'EXPLORE');
  assert.equal(policy.choose({ confidence: 1, experience: 1, risk: 1, noveltyNeed: 0, budgetPressure: 1 }), 'EXPLOIT');
  assert.equal(policy.choose({ confidence: .5, experience: .5, risk: .5, noveltyNeed: .5, budgetPressure: .5 }), 'BALANCED');
});

test('decision compression creates one reusable template from similar decisions', () => {
  const decisions = Array.from({ length: 421 }, () => ({ scope, operations: ['face', 'light'], intent: 'Portrait Enhancement', quality: .8, cost: 0, accepted: true }));
  const templates = new DecisionCompressionEngine(sequence('template')).compress(decisions);
  assert.equal(templates.length, 1); assert.equal(templates[0].count, 421); assert.equal(templates[0].name, 'Portrait Enhancement');
});

test('decision compression never merges another scope', () => {
  const engine = new DecisionCompressionEngine(sequence());
  const templates = engine.compress([{ scope, operations: ['x'], intent: 'A', quality: 1, cost: 0, accepted: true }, { scope: { ...scope, projectId: 'other' }, operations: ['x'], intent: 'A', quality: 0, cost: 1, accepted: false }]);
  assert.equal(templates.length, 2);
});

test('creative timeline displays scoped evolution in chronological order', () => {
  const timeline = new CreativeTimeline().add({ id: '2', scope, timestamp: 2, kind: 'DNA', value: { warmth: .8 } }).add({ id: '1', scope, timestamp: 1, kind: 'TASTE', value: { luxury: .9 } });
  assert.deepEqual(timeline.forScope(scope).map(event => event.id), ['1', '2']);
  assert.equal(timeline.forScope({ ...scope, tenantId: 'other' }).length, 0);
});

test('expert council aggregates only domain-specific assessments', () => {
  const candidate = { id: 'candidate', scope, strategy: 'local', operations: ['light'], predicted: metrics(), score: 1 };
  const council = new ExpertCouncil([new HeuristicCreativeExpert('quality', 'Quality', 'quality'), new HeuristicCreativeExpert('cost', 'Cost', 'cost'), new HeuristicCreativeExpert('risk', 'Risk', 'risk')]);
  const result = council.evaluate(candidate);
  assert.equal(result.assessments.length, 3); assert.ok(result.score > 0 && result.score <= 1); assert.deepEqual(result.assessments.map(item => item.domain), ['Quality', 'Cost', 'Risk']);
});

test('adaptive heuristics gradually update weights with explanations', () => {
  const engine = new AdaptiveHeuristicEngine(), result = engine.adapt({ quality: .5, cost: .5 }, { predicted: .5, actual: .8, contribution: { quality: 1, cost: -1 } }, .1);
  assert.equal(result.error, .3); assert.ok(result.weights.quality > .5); assert.ok(result.weights.cost < .5); assert.equal(result.explanations.length, 2);
});

test('adaptive heuristics are deterministic and bounded', () => {
  const engine = new AdaptiveHeuristicEngine(), input = { predicted: 0, actual: 1, contribution: { quality: 100 } };
  assert.deepEqual(engine.adapt({ quality: 1 }, input), engine.adapt({ quality: 1 }, input)); assert.equal(engine.adapt({ quality: 10 }, input).weights.quality, 10);
});

test('benchmark suite compares all required decision metrics', () => {
  const expected = { quality: .8, credits: 0, latency: 100, satisfaction: .8, stability: .9, decisionConsistency: 1 };
  const result = new DecisionBenchmarkSuite().evaluate([{ id: 'catalog', expected, actual: { ...expected }, tolerances: {} }]);
  assert.equal(result.passed, true); assert.equal(result.results[0].metrics.length, 6); assert.equal(result.passRate, 1);
});

test('benchmark suite reports deterministic regressions', () => {
  const expected = { quality: .8, credits: 0, latency: 100, satisfaction: .8, stability: .9, decisionConsistency: 1 };
  const result = new DecisionBenchmarkSuite().evaluate([{ id: 'x', expected, actual: { ...expected, credits: 10 }, tolerances: { credits: 1 } }]);
  assert.equal(result.passed, false); assert.equal(result.results[0].metrics.find(item => item.metric === 'credits')?.delta, 10);
});

test('knowledge evolution tracks parents children confidence and support', () => {
  const dependencies = { id: sequence('generation'), clock: () => 10 };
  const first = new KnowledgeEvolutionEngine(dependencies).evolve('luxury-light', .7, 5);
  const parent = first.history('luxury-light')[0], second = first.evolve('luxury-light', .85, 12, parent.id), history = second.history('luxury-light');
  assert.equal(history[1].generation, 2); assert.equal(history[1].parentId, parent.id); assert.deepEqual(history[0].children, [history[1].id]); assert.equal(history[1].support, 12);
});

test('explainability v5 contains the full cognitive chain', () => {
  const trace = new DecisionExplainabilityV5().trace({ Prompt: 'premium catalog', Winner: 'local' });
  assert.deepEqual(trace.stages.map(stage => stage.name), ['Prompt', 'Intent Space', 'Goals', 'Constraints', 'World State', 'Gap Analysis', 'Candidate Generation', 'Counterfactual Analysis', 'Causal Graph', 'Creative Principles', 'Expert Council', 'Decision Tournament', 'Winner', 'Reflection', 'Learning', 'Creative DNA', 'Decision Model']);
  assert.match(trace.text, /Counterfactual Analysis/); assert.equal(trace.version, 5);
});

test('evolution score exposes all weighted contributions', () => {
  const factors = { learning: 1, stability: 1, creativity: 1, adaptability: 1, costEfficiency: 1, goalCompletion: 1, tasteAlignment: 1, technicalQuality: 1, confidence: 1 };
  const score = new DecisionEvolutionScore().calculate(factors);
  assert.equal(score.score, 100); assert.equal(Object.keys(score.contributions).length, 9);
});

test('decision representation encoder and decoder round trip', () => {
  const encoder = new HeuristicDecisionEncoder(), decoder = new HeuristicDecisionDecoder(), representation = encoder.encode({ names: ['quality', 'warmth'], values: [.8, .6] });
  assert.deepEqual(decoder.decode(representation), { quality: .8, warmth: .6 }); assert.equal(Object.isFrozen(representation.vector), true);
});

test('decision policy chooses best deterministic representation', () => {
  const encoder = new HeuristicDecisionEncoder(), policy = new HeuristicDecisionPolicy();
  assert.equal(policy.select([encoder.encode({ names: ['x'], values: [.2] }), encoder.encode({ names: ['x'], values: [.9] })]), 1); assert.equal(policy.select([]), -1);
});

test('reward and loss provide explainable heuristic learning signals', () => {
  const predicted = metrics(), actual = metrics({ quality: .9, satisfaction: .9 });
  assert.ok(new HeuristicDecisionReward().calculate(predicted, actual) > 0); assert.ok(new HeuristicDecisionLoss().calculate(predicted, actual) > 0);
  assert.equal(new HeuristicDecisionLoss().calculate(predicted, predicted), 0);
});

test('replay buffer is immutable deterministic and scope isolated', () => {
  const representation = new HeuristicDecisionEncoder().encode({ names: ['x'], values: [1] }), empty = new ImmutableDecisionReplayBuffer();
  const filled = empty.add({ id: 'a', scope, representation, reward: .8, timestamp: 2 }).add({ id: 'b', scope, representation, reward: .9, timestamp: 1 }).add({ id: 'other', scope: { ...scope, userId: 'other' }, representation, reward: 1, timestamp: 1 });
  assert.equal(empty.sample(scope, 10).length, 0); assert.deepEqual(filled.sample(scope, 2).map(item => item.id), ['b', 'a']); assert.equal(filled.sample({ ...scope, userId: 'other' }, 2).length, 1);
});

test('inference session snapshots model version and delegates prediction', () => {
  const model = new HeuristicDecisionModel(), representation = new HeuristicDecisionEncoder().encode({ names: ['quality'], values: [.8] });
  const session = new HeuristicDecisionInferenceSession('session', model);
  assert.equal(session.id, 'session'); assert.equal(session.modelVersion, model.version()); assert.equal(session.infer(representation).quality, .8);
});

test('all generated IDs and timestamps come from injected dependencies', () => {
  const causal = new CreativeCausalLearningEngine({ id: () => 'causal-id', clock: () => 321 }).learn({ scope, path: ['A', 'B'], successful: true });
  assert.equal(causal.graph(scope)[0].id, 'causal-id'); assert.equal(causal.graph(scope)[0].lastUpdated, 321);
  const reflection = new DecisionReflectionEngine({ id: () => 'reflection-id', clock: () => 654 }).reflect({ scope, helpful: [], harmful: [], useless: [], alternatives: [], aiUsed: false, localQuality: .5, finalQuality: .5, credits: 0 });
  assert.equal(reflection.id, 'reflection-id'); assert.equal(reflection.createdAt, 654);
});

test('learning core contains no forbidden imports', () => {
  const directory = 'src/platform/creative/decision/intelligence/core';
  const forbidden = [/workflow/i, /runtime/i, /provider/i, /billing/i, /gateway/i, /react/i, /base44/i, /application/i, /editing/i, /pipeline/i, /openai/i];
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.ts')) continue;
    const imports = readFileSync(join(directory, file), 'utf8').split('\n').filter(line => /^import|^export .* from/.test(line)).join('\n');
    for (const pattern of forbidden) assert.equal(pattern.test(imports), false, `${file} imports ${pattern}`);
  }
});
