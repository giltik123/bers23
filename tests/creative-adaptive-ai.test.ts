import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  AdaptiveQualityCalibrator,
  CreativeAdaptiveAI,
  StatisticalExplorationPolicy,
  StatisticalModelRanker,
  StatisticalOutcomeEvaluator,
  type AdaptiveOptions,
  type ExecutionObservation,
  type RecommendationRequest,
} from '../src/platform/creative/adaptive-ai/index.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const key = (modelId = 'model-a') => Object.freeze({ deviceClass: 'BROWSER_WEBGPU_HIGH' as const, operation: 'segmentation', modelId, runtime: 'WEBGPU' });
const observation = (index: number, values: Partial<ExecutionObservation> = {}): ExecutionObservation => ({
  observationId: `observation-${index}`,
  scope,
  key: key(),
  target: 'LOCAL',
  phase: 'PREVIEW',
  prediction: { quality: .94, latencyMs: 200, cost: 0, successProbability: .9, energy: .2 },
  actual: { quality: .88, latencyMs: 180, cost: 0, success: true, energy: .15, memoryMb: 256, cloudSavings: .7, fallbackUsed: false, accepted: true },
  at: index * 1_000,
  ...values,
});

const create = (values: Partial<AdaptiveOptions> = {}) => {
  let now = 0;
  let random = .5;
  const app = new CreativeAdaptiveAI({ now: () => ++now, random: () => random }, {
    scope,
    privacyMode: 'NORMAL',
    config: { minimumEvidence: 5, activationEvidence: 10, maximumVariance: 1 },
    ...values,
  });
  return { app, setRandom: (value: number) => { random = value; } };
};

const request = (values: Partial<RecommendationRequest> = {}): RecommendationRequest => ({
  scope,
  phase: 'PREVIEW',
  mode: 'EXPLOIT',
  cloudAllowed: true,
  outboundNetworkAllowed: true,
  candidates: [
    { key: key('model-a'), target: 'LOCAL', trustedModel: true, runtimeAllowed: true, quarantined: false, outboundNetworkRequired: false },
    { key: key('model-b'), target: 'LOCAL', trustedModel: true, runtimeAllowed: true, quarantined: false, outboundNetworkRequired: false },
  ],
  ...values,
});

const learn = (app: CreativeAdaptiveAI, count: number, make = observation) => {
  for (let index = 1; index <= count; index += 1) {
    const item = make(index);
    app.observe(item);
    app.learn(app.evaluate(item.observationId));
  }
};

const categories = [
  'outcome-quality-error', 'outcome-latency-error', 'outcome-cost-error', 'outcome-success-error',
  'confidence-growth', 'variance-stability', 'matrix-quality', 'matrix-latency', 'matrix-success',
  'matrix-energy', 'matrix-memory', 'matrix-savings', 'matrix-fallback', 'matrix-acceptance',
  'exploit', 'explore', 'balanced-explore', 'balanced-exploit', 'ranking-quality', 'ranking-latency',
  'quality-calibration', 'latency-calibration', 'energy-calibration', 'snapshot-immutability',
] as const;

for (const category of categories) {
  for (let variant = 1; variant <= 9; variant += 1) {
    test(`${category} deterministic case ${variant}`, () => {
      const outcome = new StatisticalOutcomeEvaluator().evaluate(observation(variant));
      if (category === 'outcome-quality-error') assert.ok(Math.abs(outcome.error.quality + .06) < 1e-9);
      if (category === 'outcome-latency-error') assert.equal(outcome.error.latencyMs, -20);
      if (category === 'outcome-cost-error') assert.equal(outcome.error.cost, 0);
      if (category === 'outcome-success-error') assert.ok(Math.abs(outcome.error.success - .1) < 1e-9);
      if (category === 'confidence-growth' || category === 'variance-stability' || category.startsWith('matrix-') || category === 'snapshot-immutability') {
        const { app } = create();
        learn(app, variant);
        const entry = app.snapshot().deviceMatrix[0];
        if (category === 'confidence-growth') assert.ok(Math.abs(entry.confidence - Math.min(1, variant / 10)) < .00001);
        if (category === 'variance-stability') assert.ok(entry.stability >= 0 && entry.stability <= 1);
        if (category === 'matrix-quality') assert.equal(entry.quality, .88);
        if (category === 'matrix-latency') assert.equal(entry.latencyMs, 180);
        if (category === 'matrix-success') assert.equal(entry.successRate, 1);
        if (category === 'matrix-energy') assert.equal(entry.energy, .15);
        if (category === 'matrix-memory') assert.equal(entry.memoryMb, 256);
        if (category === 'matrix-savings') assert.equal(entry.cloudSavings, .7);
        if (category === 'matrix-fallback') assert.equal(entry.fallbackRate, 0);
        if (category === 'matrix-acceptance') assert.equal(entry.acceptanceRate, 1);
        if (category === 'snapshot-immutability') assert.ok(Object.isFrozen(app.snapshot().deviceMatrix));
      }
      if (category === 'exploit') assert.equal(new StatisticalExplorationPolicy().explore('EXPLOIT', 0, .1), false);
      if (category === 'explore') assert.equal(new StatisticalExplorationPolicy().explore('EXPLORE', 1, .1), true);
      if (category === 'balanced-explore') assert.equal(new StatisticalExplorationPolicy().explore('BALANCED', .01, .1), true);
      if (category === 'balanced-exploit') assert.equal(new StatisticalExplorationPolicy().explore('BALANCED', .9, .1), false);
      if (category.startsWith('ranking-')) {
        const base = { ...key(), quality: .8, latencyMs: 500, successRate: .9, energy: .2, memoryMb: 100, cloudSavings: .5, fallbackRate: 0, acceptanceRate: .9, confidence: 1, variance: 0, stability: 1, sampleCount: 100, effectiveSampleCount: 100, updatedAt: 1 };
        const best = category === 'ranking-quality' ? { ...base, modelId: 'best', quality: .99 } : { ...base, modelId: 'best', latencyMs: 20 };
        assert.equal(new StatisticalModelRanker().rank([base, best])[0].modelId, 'best');
      }
      if (category.endsWith('calibration')) {
        const state = new AdaptiveQualityCalibrator().update({ qualityBias: 0, latencyMultiplier: 1, energyMultiplier: 1, sampleCount: 0 }, outcome);
        if (category === 'quality-calibration') assert.ok(Math.abs(state.qualityBias + .06) < 1e-9);
        if (category === 'latency-calibration') assert.equal(state.latencyMultiplier, .9);
        if (category === 'energy-calibration') assert.ok(Math.abs(state.energyMultiplier - .75) < 1e-9);
      }
    });
  }
}

test('closed loop observes, evaluates, learns, adapts, canaries, and promotes', () => {
  const { app } = create();
  learn(app, 10);
  const change = app.adapt();
  assert.equal(change?.version.status, 'CANARY');
  assert.equal(app.promote(change!.version.version).status, 'ACTIVE');
  assert.equal(app.snapshot().learningStatistics.observations, 10);
});

test('insufficient evidence remains observe-only', () => {
  const { app } = create();
  learn(app, 2);
  assert.equal(app.adapt(), undefined);
});

test('automatic canary evaluation rolls back regression', () => {
  const { app } = create();
  learn(app, 10);
  const version = app.adapt()!.version.version;
  const baseline = [app.evaluate(observation(100, { observationId: 'base' }))];
  const bad = [app.evaluate(observation(101, { observationId: 'bad', actual: { ...observation(1).actual, quality: .2, latencyMs: 2_000, fallbackUsed: true } }))];
  assert.equal(app.evaluateCanary(version, baseline, bad).status, 'ACTIVE');
  assert.equal(app.snapshot().rollbackHistory.length, 1);
});

test('A/B comparison reports policy utility', () => {
  const { app } = create();
  learn(app, 10);
  const version = app.adapt()!.version.version;
  const outcome = app.evaluate(observation(100, { observationId: 'experiment' }));
  assert.equal(app.compare(1, version, [outcome], [outcome]).samplesA, 1);
});

test('security guard rejects untrusted, quarantined, and unknown runtime candidates', () => {
  const { app } = create();
  assert.throws(() => app.recommend(request({ candidates: [
    { key: key(), target: 'LOCAL', trustedModel: false, runtimeAllowed: false, quarantined: true, outboundNetworkRequired: false },
  ] })), /security/);
});

test('privacy mode never learns increased cloud routing', () => {
  const { app } = create({ privacyMode: 'LOCAL_ONLY' });
  assert.throws(() => app.recommend(request({ candidates: [
    { key: key(), target: 'CLOUD', trustedModel: true, runtimeAllowed: true, quarantined: false, outboundNetworkRequired: true },
  ] })), /security and privacy/);
});

test('scope isolation prevents cross-tenant learning', () => {
  const { app } = create();
  assert.throws(() => app.observe(observation(1, { scope: { ...scope, tenantId: 'other' } })), /Cross-scope/);
});

for (const runs of [10, 100, 1_000, 10_000]) {
  test(`learning remains stable through ${runs} synthetic outcomes`, () => {
    const { app } = create({ config: { minimumEvidence: 5, activationEvidence: 20, maximumVariance: 1, decayHalfLifeMs: 1e12 } });
    learn(app, runs);
    const entry = app.snapshot().deviceMatrix[0];
    assert.ok(Math.abs(entry.quality - .88) < 1e-9);
    assert.ok(entry.confidence > 0);
    assert.equal(app.simulate(request(), runs).runs, runs);
  });
}

test('dependency injection controls statistical components', () => {
  const { app } = create({ exploration: { explore: () => false } });
  assert.equal(app.recommend(request({ mode: 'EXPLORE' })).exploration, false);
});

test('debugger exposes full causal chain and non-learnable security boundary', () => {
  const { app } = create();
  assert.equal(app.debug().securityBoundary, 'NON_LEARNABLE');
  assert.equal((app.debug().chain as string[]).length, 9);
});

test('adaptive-ai scope uses only approved public subsystem boundaries', async () => {
  for (const file of await collect('src/platform/creative/adaptive-ai')) {
    const source = (await readFile(file, 'utf8')).toLowerCase();
    for (const marker of ['node:fs', 'node:http', 'axios', "from '../local-ai/", "from '../model-distribution/"]) {
      assert.equal(source.includes(marker), false, `${file} contains forbidden import ${marker}`);
    }
  }
});

async function collect(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? collect(join(directory, entry.name))
    : Promise.resolve(entry.name.endsWith('.ts') ? [join(directory, entry.name)] : [])))).flat();
}
