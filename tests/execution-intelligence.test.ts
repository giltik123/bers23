import assert from 'node:assert/strict';
import test from 'node:test';
import { createExecutionIntelligence, type ExecutionMetricStatus } from '../src/platform/intelligence';

function record(intelligence: ReturnType<typeof createExecutionIntelligence>, provider: string, options: { capability?: string; duration?: number; cost?: number; status?: ExecutionMetricStatus; signature?: string } = {}): void {
  const index = intelligence.analytics.metrics.getAll().length;
  intelligence.feedback.process({ executionId: `execution-${index}`, routeId: 'route-test', capability: options.capability ?? 'image-edit', provider, worker: `${provider}-worker`, duration: options.duration ?? 1000, cost: options.cost ?? 0.01, status: options.status ?? 'SUCCESS', metadata: options.signature ? { failureSignature: options.signature } : {} });
}

test('ranks a faster provider above a cheaper but much slower provider', () => {
  const intelligence = createExecutionIntelligence();
  for (let index = 0; index < 10; index += 1) { record(intelligence, 'provider-a', { duration: 1000, cost: 0.04 }); record(intelligence, 'provider-b', { duration: 4000, cost: 0.01 }); }
  const ranking = intelligence.ranking.rank([{ provider: 'provider-a' }, { provider: 'provider-b' }]);

  assert.equal(ranking[0].provider, 'provider-a');
  assert.ok(ranking[0].score > ranking[1].score);
  assert.equal(ranking.find((value) => value.provider === 'provider-b')?.costEfficiency, 1);
  assert.equal(ranking.find((value) => value.provider === 'provider-a')?.speed, 1);
});

test('failure and timeout history produces HIGH risk and lowers ranking', () => {
  const intelligence = createExecutionIntelligence();
  for (let index = 0; index < 8; index += 1) record(intelligence, 'reve', { status: index < 5 ? 'FAILED' : 'SUCCESS', signature: 'night-loose-clothing' });
  for (let index = 0; index < 8; index += 1) record(intelligence, 'provider-x', { status: 'SUCCESS', duration: 1200, cost: 0.01 });

  const insight = intelligence.analytics.failures.analyzeProvider('reve');
  assert.equal(insight.risk, 'HIGH');
  assert.equal(intelligence.ranking.rank([{ provider: 'reve' }, { provider: 'provider-x' }])[0].provider, 'provider-x');
  assert.equal(intelligence.analytics.patterns.detect(3)[0].alternativeWorkflow, true);
});

test('budget optimizer selects cheap Free route and maximum-quality Studio route', () => {
  const intelligence = createExecutionIntelligence();
  const options = [{ provider: 'cheap', estimatedCost: 2, quality: 0.65 }, { provider: 'balanced', estimatedCost: 5, quality: 0.85 }, { provider: 'quality', estimatedCost: 9, quality: 0.99 }];
  const free = intelligence.budget.optimize({ plan: 'free', availableCredits: 10, options });
  const studio = intelligence.budget.optimize({ plan: 'studio', availableCredits: 10, options });
  assert.equal(free.provider, 'cheap');
  assert.equal(free.quality, 'medium');
  assert.equal(studio.provider, 'quality');
  assert.equal(studio.quality, 'maximum');
});

test('adaptive feedback recommends a stronger provider after current-route failures', () => {
  const intelligence = createExecutionIntelligence();
  for (let index = 0; index < 20; index += 1) record(intelligence, 'reve', { capability: 'hair-edit', status: index < 10 ? 'FAILED' : 'SUCCESS', duration: 3000, cost: 0.03 });
  for (let index = 0; index < 20; index += 1) record(intelligence, 'provider-x', { capability: 'hair-edit', status: index === 0 ? 'FAILED' : 'SUCCESS', duration: 1800, cost: 0.02 });
  const decision = intelligence.optimizer.optimize('hair-edit', ['reve', 'provider-x'], 'reve');
  assert.equal(decision.recommendedProvider, 'provider-x');
  assert.equal(decision.changed, true);
  assert.match(decision.reason, /stronger historical/i);
});

test('metrics store is bounded, immutable, and queryable by provider, capability, time, and status', () => {
  const intelligence = createExecutionIntelligence();
  for (let index = 0; index < 3; index += 1) record(intelligence, index < 2 ? 'reve' : 'fashn', { capability: index < 2 ? 'image-edit' : 'virtual-try-on', status: index === 1 ? 'TIMEOUT' : 'SUCCESS' });
  assert.equal(intelligence.analytics.metrics.getByProvider('reve').length, 2);
  assert.equal(intelligence.analytics.metrics.getByCapability('virtual-try-on').length, 1);
  assert.equal(intelligence.analytics.metrics.getFailures().length, 1);
  assert.equal(intelligence.analytics.metrics.getByStatus('TIMEOUT').length, 1);
  assert.equal(Object.isFrozen(intelligence.analytics.metrics.getRecent(1)[0]), true);
});
