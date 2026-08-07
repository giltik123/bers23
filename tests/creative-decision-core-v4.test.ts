import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  AdaptiveCreativityLevel, CreativeGapAnalyzer, CreativeGoalHierarchy,
  CreativeHypothesisEngine, CreativeIntentSpace, CreativeMemoryCompression,
  CreativeMetaKnowledge, CreativeOpportunityDetector, CreativeUncertaintyMap,
  CreativeValuePredictor, CreativeWorldState, DecisionCheckpointFactory,
  DecisionConfidenceDecomposer, DecisionConsistencyAnalyzer, DecisionDriftDetector,
  DecisionEvaluationBenchmark, DecisionEvolutionTree, DecisionExperimentEngine,
  DecisionModelRegistry, DecisionQuestionGenerator, DecisionSelfReflection,
  DeterministicDecisionTrainer, HeuristicDecisionFeatureEncoder,
  HeuristicDecisionInferenceEngine, HeuristicDecisionModel,
  IdentityDecisionLatentSpace, MultiStepCreativePlanner,
} from '../src/platform/creative/decision/intelligence/core';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const ids = () => { let value = 0; return () => `id-${++value}`; };

test('intent space creates a normalized distribution rather than one intent', () => {
  const distribution = new CreativeIntentSpace().create(scope, { Luxury: .91, Catalog: .84, Minimal: .53 });
  assert.equal(distribution.intents.length, 3);
  assert.ok(Math.abs(distribution.intents.reduce((sum, item) => sum + item.probability, 0) - 1) < .00001);
  assert.ok(distribution.entropy > 0);
});

test('intent distributions combine deterministically and enforce scope', () => {
  const space = new CreativeIntentSpace(), left = space.create(scope, { Luxury: 1 }), right = space.create(scope, { Catalog: 1 });
  assert.deepEqual(space.combine(left, right), space.combine(left, right));
  assert.throws(() => space.combine(left, space.create({ ...scope, userId: 'other' }, { Catalog: 1 })), /different scopes/);
});

test('goal hierarchy exposes causal path and leaves', () => {
  const goals = new CreativeGoalHierarchy();
  const warm = goals.create('warm', 'Warm Tone'), premium = goals.create('premium', 'Premium Look', .9, [warm]), sell = goals.create('sell', 'Sell Product', 1, [premium]);
  assert.deepEqual(goals.path(sell, 'warm').map(goal => goal.id), ['sell', 'premium', 'warm']);
  assert.deepEqual(goals.leaves(sell).map(goal => goal.id), ['warm']);
});

test('world state is immutable and evolves by revision', () => {
  const engine = new CreativeWorldState(), initial = engine.create(scope), updated = engine.update(initial, { lighting: { value: .3, confidence: .9, source: 'analysis' } });
  assert.equal(initial.revision, 1); assert.equal(updated.revision, 2); assert.equal(initial.attributes.lighting, undefined);
  assert.throws(() => ((updated.attributes as any).lighting.value = 1));
});

test('gap analyzer compares current and desired world states', () => {
  const world = new CreativeWorldState(), current = world.update(world.create(scope), { lighting: { value: 'flat', confidence: .8, source: 'local' } }), desired = world.update(world.create(scope), { lighting: { value: 'luxury', confidence: 1, source: 'goal' } });
  const gaps = new CreativeGapAnalyzer().analyze(current, desired);
  assert.equal(gaps[0].dimension, 'lighting'); assert.match(gaps[0].explanation, /flat.*luxury/);
});

test('gap analyzer prevents tenant data crossing', () => {
  const world = new CreativeWorldState();
  assert.throws(() => new CreativeGapAnalyzer().analyze(world.create(scope), world.create({ ...scope, tenantId: 'other' })), /different scopes/);
});

test('multi-step plan contains dependencies and quality gate', () => {
  const id = ids(), plan = new MultiStepCreativePlanner({ id, clock: () => 1, random: () => .5 }).create(scope, 'premium', ['lighting', 'contrast']);
  assert.deepEqual(plan.steps.map(step => step.kind), ['OPERATION', 'OPERATION', 'QUALITY_CHECK', 'FINISH']);
  assert.deepEqual(plan.steps[1].dependsOn, [plan.steps[0].id]);
});

test('hypotheses contain probability, confidence and expected gain', () => {
  const hypotheses = new CreativeHypothesisEngine(ids()).generate(scope, [{ dimension: 'lighting', current: 'flat', desired: 'warm', severity: .8, explanation: 'gap' }]);
  assert.equal(hypotheses.length, 1); assert.ok(hypotheses[0].probability > .5); assert.equal(hypotheses[0].expectedGain, 80);
});

test('virtual experiments compare strategies without external calls', () => {
  const results = new DecisionExperimentEngine(new HeuristicDecisionModel(), ids()).run(scope, { A: ['lighting'], B: ['lighting', 'contrast'] });
  assert.equal(results.length, 2); assert.ok(results[0].score >= results[1].score); assert.equal(Object.isFrozen(results), true);
});

test('opportunity detector recognizes local fixes and unnecessary AI', () => {
  const world = new CreativeWorldState(), state = world.update(world.create(scope), { lighting: { value: .2, confidence: 1, source: 'local' }, background: { value: 'good', confidence: 1, source: 'local' } });
  const opportunities = new CreativeOpportunityDetector().detect(state);
  assert.ok(opportunities.some(item => item.operation === 'light_adjustment' && item.local));
  assert.ok(opportunities.some(item => item.operation === 'preserve_background'));
});

test('confidence is a decomposed immutable profile', () => {
  const profile = new DecisionConfidenceDecomposer().create({ technical: .9, creative: .8, goal: .7, economic: .6, historical: .5, preference: .4 });
  assert.ok(profile.overall > .4 && profile.overall < .9); assert.equal(Object.isFrozen(profile), true);
});

test('uncertainty map names exactly what is unknown', () => {
  const world = new CreativeWorldState(), state = world.update(world.create(scope), { background: { value: 'white', confidence: .9, source: 'local' } });
  const uncertainty = new CreativeUncertaintyMap().fromWorldState(state);
  assert.equal(uncertainty.find(item => item.dimension === 'style')?.level, 'VERY_HIGH');
  assert.equal(uncertainty.find(item => item.dimension === 'background')?.level, 'LOW');
});

test('question generator derives questions from uncertainty and intent ambiguity', () => {
  const id = ids(), intents = new CreativeIntentSpace().create(scope, { Luxury: .51, Catalog: .49 });
  const questions = new DecisionQuestionGenerator(id).generate([{ dimension: 'background', uncertainty: .9, level: 'VERY_HIGH' }], intents);
  assert.ok(questions.some(question => /Luxury.*Catalog/.test(question.text)));
  assert.ok(questions.some(question => /фон/.test(question.text)));
});

test('memory compression replaces records with scoped clusters', () => {
  const records = Array.from({ length: 340 }, () => ({ scope, intents: ['Luxury', 'Portrait'], operations: ['lighting'], quality: .8, accepted: true }));
  const clusters = new CreativeMemoryCompression().compress(records);
  assert.equal(clusters.length, 1); assert.equal(clusters[0].count, 340); assert.equal(clusters[0].acceptance, 1);
});

test('memory compression does not combine equal signatures from other users', () => {
  const clusters = new CreativeMemoryCompression().compress([{ scope, intents: ['Luxury'], operations: [], quality: .8, accepted: true }, { scope: { ...scope, userId: 'other' }, intents: ['Luxury'], operations: [], quality: .2, accepted: false }]);
  assert.equal(clusters.length, 2);
});

test('drift detector identifies a long-term style transition', () => {
  const drift = new DecisionDriftDetector().detect([{ scope, timestamp: 1, dimensions: { luxury: 1, minimal: 0 } }, { scope, timestamp: 10, dimensions: { luxury: 0, minimal: 1 } }], 5);
  assert.equal(drift.detected, true); assert.equal(drift.dimensions.luxury, -1);
});

test('drift detector rejects mixed histories', () => {
  assert.throws(() => new DecisionDriftDetector().detect([{ scope, timestamp: 1, dimensions: {} }, { scope: { ...scope, projectId: 'other' }, timestamp: 2, dimensions: {} }], 2), /one scope/);
});

test('consistency analyzer explains cost versus AI conflict', () => {
  const result = new DecisionConsistencyAnalyzer().analyze([{ id: 'cheap', kind: 'MINIMIZE', target: 'cost', value: 0 }, { id: 'many', kind: 'REQUIRE', target: 'aiVariants', value: 20 }]);
  assert.equal(result.consistent, false); assert.match(result.conflicts[0].explanation, /AI variants/);
});

test('value predictor produces contextual value instead of quality', () => {
  const confidence = new DecisionConfidenceDecomposer().create({ technical: .9, creative: .9, goal: .9, economic: .9, historical: .9, preference: .9 });
  const value = new CreativeValuePredictor().predict(confidence, new CreativeIntentSpace().create(scope, { Catalog: .92, Instagram: .08 }), .8);
  assert.ok(value.Catalog > value.Instagram); assert.ok(value.Catalog <= 100);
});

test('adaptive creativity spans conservative through wild', () => {
  const adaptive = new AdaptiveCreativityLevel();
  assert.equal(adaptive.select({ riskTolerance: 0, uncertainty: 1, fatigue: 1, noveltyPreference: 0 }), 'CONSERVATIVE');
  assert.equal(adaptive.select({ riskTolerance: 1, uncertainty: 0, fatigue: 0, noveltyPreference: 1 }), 'WILD');
});

test('evolution tree retains the full lineage immutably', () => {
  const tree = new DecisionEvolutionTree().add({ id: 'idea', state: 'Idea', explanation: 'start', timestamp: 1 }).add({ id: 'light', parentId: 'idea', state: 'Lighting', explanation: 'improve', timestamp: 2 }).add({ id: 'done', parentId: 'light', state: 'Finished', explanation: 'finish', timestamp: 3 });
  assert.deepEqual(tree.lineage('done').map(node => node.state), ['Idea', 'Lighting', 'Finished']);
  assert.throws(() => (tree.snapshot() as any).push({}));
});

test('meta knowledge performs deterministic scoped graph inference', () => {
  const knowledge = new CreativeMetaKnowledge().add({ id: '1', scope, when: 'Luxury', then: ['warm lighting'], confidence: .9 }).add({ id: '2', scope, when: 'warm lighting', then: ['clean background'], confidence: .8 });
  assert.deepEqual(knowledge.infer(scope, 'Luxury'), ['warm lighting', 'clean background']);
  assert.deepEqual(knowledge.infer({ ...scope, tenantId: 'other' }, 'Luxury'), []);
});

test('self reflection reports weakness, cheaper path and surprises', () => {
  const base = { quality: .8, latency: 100, risk: .2, probability: .8, satisfaction: .8, creativity: .5 };
  const experiments = [
    { id: 'expensive', scope, strategy: 'expensive', operations: ['a', 'b'], predicted: { ...base, cost: 10 }, score: 1 },
    { id: 'cheap', scope, strategy: 'cheap', operations: ['a'], predicted: { ...base, cost: 0 }, score: .9 },
  ];
  const selected = experiments[0];
  const reflection = new DecisionSelfReflection().reflect({ candidates: experiments, selectedId: selected.id, actual: { quality: 0 } });
  assert.ok(reflection.cheaperAlternative); assert.ok(reflection.unexpected.length > 0); assert.ok(reflection.remember);
});

test('feature encoder and latent space are deterministic and ordered', () => {
  const world = new CreativeWorldState(), state = world.update(world.create(scope), { quality: { value: .8, confidence: .5, source: 'local' } }), goal = new CreativeGoalHierarchy().create('goal', 'Goal', .9);
  const encoded = new HeuristicDecisionFeatureEncoder().encode(state, goal, { budget: .4 });
  assert.deepEqual(encoded.names, [...encoded.names].sort());
  const latent = new IdentityDecisionLatentSpace(), vector = latent.project(encoded);
  assert.equal(latent.distance(vector, vector), 0);
});

test('inference contract remains compatible with DecisionModel', () => {
  const inference = new HeuristicDecisionInferenceEngine(new HeuristicDecisionModel()).infer({ names: ['quality'], values: [.8] });
  assert.equal(inference.metrics.quality, .8); assert.equal(inference.explanation.model, 'heuristic');
});

test('trainer sorts samples for repeatable future training', () => {
  const trainer = new DeterministicDecisionTrainer(), samples = [{ id: 'b', features: { x: .2 }, outcome: {} }, { id: 'a', features: { x: .8 }, outcome: {} }];
  const first = trainer.train(new HeuristicDecisionModel(), samples), second = trainer.train(new HeuristicDecisionModel(), [...samples].reverse());
  assert.equal(first.exportDataset(), second.exportDataset());
});

test('checkpoint receives ID and time exclusively through DI', () => {
  const checkpoint = new DecisionCheckpointFactory({ id: () => 'checkpoint', clock: () => 123 }).create(new HeuristicDecisionModel(), 4, { purpose: 'test' });
  assert.equal(checkpoint.id, 'checkpoint'); assert.equal(checkpoint.createdAt, 123); assert.equal(checkpoint.schemaVersion, 4);
});

test('benchmark deterministically evaluates model compatibility', () => {
  const benchmark = new DecisionEvaluationBenchmark(), scenarios = [{ id: 'quality', features: { quality: .8 }, expected: { quality: .8 }, tolerance: 0 }];
  assert.equal(benchmark.evaluate(new HeuristicDecisionModel(), scenarios).passRate, 1);
});

test('model registry switches implementations without changing the contract', () => {
  const first = new HeuristicDecisionModel(), second = first.calibrate();
  const registry = new DecisionModelRegistry().register('stable', first).register('candidate', second).activate('candidate');
  assert.equal(registry.current().version(), second.version()); assert.deepEqual(registry.list(), ['candidate', 'stable']);
});

test('all public cognitive results are repeatable', () => {
  const intent = new CreativeIntentSpace();
  assert.deepEqual(intent.create(scope, { Luxury: .91, Catalog: .84 }), intent.create(scope, { Catalog: .84, Luxury: .91 }));
});

test('core has no forbidden infrastructure imports', () => {
  const directory = 'src/platform/creative/decision/intelligence/core';
  const forbidden = [/workflow/i, /runtime/i, /provider/i, /billing/i, /gateway/i, /react/i, /base44/i, /application/i, /editing/i, /pipeline/i];
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.ts')) continue;
    const imports = readFileSync(join(directory, file), 'utf8').split('\n').filter(line => /^import|^export .* from/.test(line)).join('\n');
    for (const pattern of forbidden) assert.equal(pattern.test(imports), false, `${file}: ${pattern}`);
  }
});
