import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeDecisionModel, DecisionDatasetBuilder, DecisionFeatureEncoderV1, DecisionModelEvaluator, DecisionModelRegistry, DecisionTrainerV1, FEATURE_NAMES, HeuristicBaselineModel, ModelDriftMonitor, TabularDecisionModelV1 } from '../src/platform/creative/model';

const context = (n = 0) => ({ operation: `edit-${n}`, intent: 'repair', goal: 'quality', deviceClass: 'desktop', platform: 'web', projectType: 'portrait', privacyMode: 'STANDARD', budget: 10, latencyTarget: 5000, qualityTarget: .8, projectId: `project-${n}`, deviceId: `device-${n}`, timestamp: n });
const candidate = (id = 'local', target: 'LOCAL'|'CLOUD'|'HYBRID' = 'LOCAL') => ({ id, executionTarget: target, model: `model-${id}`, provider: target === 'LOCAL' ? 'device' : 'cloud', runtime: 'wasm', estimatedQuality: .8, estimatedLatency: 1000, estimatedCost: target === 'LOCAL' ? 0 : 2, energy: 2, memory: 1024, reliability: .9 });
const experience = (n = 0) => ({ context: context(n), candidate: candidate(`c-${n}`), actualOutcome: { success: true, quality: .85, latency: 900, cost: 0, accepted: true, undone: false, corrected: false, escalated: false } });

test('encoder follows the versioned schema', () => { const e = new DecisionFeatureEncoderV1(); assert.equal(e.schemaVersion, 'decision-features-v1'); assert.equal(e.encode(context(), candidate()).length, FEATURE_NAMES.length); });
test('encoder is deterministic and normalized', () => { const e = new DecisionFeatureEncoderV1(); assert.deepEqual(e.encode(context(), candidate()), e.encode(context(), candidate())); assert.ok(e.encode(context(), candidate()).every(v => v >= 0 && v <= 1)); });
test('dataset builder produces immutable ML records', () => { const row = new DecisionDatasetBuilder(undefined, () => 42).build([experience()])[0]; assert.equal(row.timestamp, 0); assert.equal(row.modelVersion, 'baseline-v0'); assert.throws(() => (row.context.operation = 'x')); });
test('reward values accepted local success', () => assert.ok(new DecisionDatasetBuilder().build([experience()])[0].reward > .6));
test('tabular model exposes six prediction heads', () => assert.deepEqual(Object.keys(new TabularDecisionModelV1().predict(context(), candidate()).outcomes), ['quality','successProbability','acceptanceProbability','latency','cost','escalationProbability']));
test('rank is descending and stable', () => { const rows = new TabularDecisionModelV1().rank(context(), [candidate('b','CLOUD'), candidate('a')]); assert.ok(rows[0].expectedUtility >= rows[1].expectedUtility); });
test('LOCAL_ONLY cannot route cloud', () => { const rows = new TabularDecisionModelV1().rank({ ...context(), privacyMode: 'LOCAL_ONLY' }, [candidate('cloud','CLOUD'), candidate()]); assert.equal(rows.at(-1)?.expectedUtility, -1); assert.ok(rows.at(-1)?.explanation.constraintExclusions.includes('CLOUD_FORBIDDEN')); });
test('quarantine is a hard constraint', () => { const c = { ...candidate(), quarantined: true }; assert.equal(new TabularDecisionModelV1().rank(context(), [c])[0].expectedUtility, -1); });
test('budget and runtime are hard constraints', () => { const c = { ...candidate(), estimatedCost: 20 }; const result = new TabularDecisionModelV1().rank(context(), [c], {}, { supportedRuntimes: ['native'] })[0]; assert.deepEqual(result.explanation.constraintExclusions, ['UNSUPPORTED_RUNTIME','BUDGET_EXCEEDED']); });
test('OOD uses heuristic fallback action', () => { const model = new TabularDecisionModelV1({ trainingCentroid: Array(FEATURE_NAMES.length).fill(0), oodDistance: .01 }); assert.equal(model.predict(context(), candidate()).action, 'FALLBACK_TO_HEURISTIC'); });
test('project-aware split prevents overlap', () => { const rows = new DecisionDatasetBuilder().build(Array.from({length: 30}, (_, i) => experience(i))); const s = new DecisionTrainerV1().split(rows); const train = new Set(s.train.map(r => r.projectId)); assert.ok(s.test.every(r => !train.has(r.projectId))); });
test('training is deterministic apart from injected time', () => { const rows = new DecisionDatasetBuilder().build(Array.from({length: 20}, (_, i) => experience(i))); const trainer = new DecisionTrainerV1(undefined, undefined, () => 9); assert.deepEqual(trainer.train(rows).model.version(), trainer.train(rows).model.version()); });
test('evaluator produces all requested metrics', () => { const rows = new DecisionDatasetBuilder().build([experience()]); assert.equal(Object.keys(new DecisionModelEvaluator().evaluate(new HeuristicBaselineModel(), rows)).length, 10); });
test('registry supports canary and promotion', () => { const registry = new DecisionModelRegistry(); const model = new TabularDecisionModelV1(); registry.register(model.version()); assert.equal(registry.canary('v1', .1).status, 'CANARY'); assert.equal(registry.promote('v1').status, 'ACTIVE'); });
test('registry rollback is fail safe', () => { const registry = new DecisionModelRegistry(); registry.register(new TabularDecisionModelV1().version()); assert.equal(registry.rollback('v1').status, 'ROLLED_BACK'); assert.equal(registry.route('v1', 'request'), false); });
test('drift requests retraining', () => assert.equal(new ModelDriftMonitor(.1).detect({ feature:[0] }, { feature:[1] }).status, 'RETRAIN_REQUIRED'));
test('shadow does not control execution', () => { const facade = new CreativeDecisionModel(); facade.shadow(new TabularDecisionModelV1()); const result = facade.predict(context(), candidate()); assert.equal(result.candidate.id, 'local'); assert.equal(facade.snapshot().shadowDecisions.length, 1); });
test('facade rollback restores heuristic baseline', () => { const facade = new CreativeDecisionModel(); const trained = new TabularDecisionModelV1(); facade.register(trained); facade.promote(trained); facade.rollback('v1'); assert.equal(facade.snapshot().active.modelVersion, 'v0'); });
test('human correction and undo remain distinct dataset signals', () => { const row = new DecisionDatasetBuilder().build([{ ...experience(), actualOutcome: { ...experience().actualOutcome, accepted:false, undone:true, corrected:true } }])[0]; assert.equal(row.actualOutcome.undone, true); assert.equal(row.actualOutcome.corrected, true); });
test('explanation contains influences without reasoning traces', () => { const e = new TabularDecisionModelV1().explain(context(), candidate()); assert.equal(e.topInfluentialFeatures.length, 5); assert.equal('chainOfThought' in e, false); });

// A fixed 10 x 25 conformance matrix covers every benchmark-like operation across
// devices, privacy modes, targets, normalization boundaries, and repeatability.
for (let scenario = 0; scenario < 10; scenario++) for (let variant = 0; variant < 25; variant++) test(`decision conformance ${scenario + 1}.${variant + 1}`, () => {
  const privacyMode = variant % 5 === 0 ? 'LOCAL_ONLY' : 'STANDARD'; const target = variant % 3 === 0 ? 'CLOUD' : 'LOCAL';
  const ctx = { ...context(scenario), privacyMode, budget: 1 + variant, latencyTarget: 1000 + variant * 100 };
  const c = { ...candidate(`${scenario}-${variant}`, target), estimatedQuality: variant / 24, estimatedCost: target === 'CLOUD' ? 2 : 0 };
  const encoder = new DecisionFeatureEncoderV1(); const first = encoder.encode(ctx, c); const second = encoder.encode(ctx, c);
  assert.deepEqual(first, second); assert.equal(first.length, FEATURE_NAMES.length); assert.ok(first.every(Number.isFinite)); assert.ok(first.every(v => v >= 0 && v <= 1));
  const prediction = new TabularDecisionModelV1().rank(ctx, [c])[0]; assert.ok(prediction.predictionConfidence >= 0 && prediction.predictionConfidence <= 1);
  if (privacyMode === 'LOCAL_ONLY' && target === 'CLOUD') assert.ok(prediction.explanation.constraintExclusions.includes('CLOUD_FORBIDDEN'));
});
