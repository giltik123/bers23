import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../src/application/createApplication';
import { ServiceContainer } from '../src/core/container';
import {
  CapabilityRouter,
  RoutingFeedback,
  RoutingValidator,
  createDefaultCapabilityGraph,
} from '../src/platform/router';

test('rejects virtual try-on with missing capability dependencies', async () => {
  const platform = await createApplication(new ServiceContainer());
  const validator = new RoutingValidator(platform.context, createDefaultCapabilityGraph());
  const result = validator.validate({ capabilities: ['virtual-try-on'], modules: ['editing-engine', 'image-pipeline'], providers: ['fashn'] });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /garment-processing/);
  assert.match(result.errors.join(' '), /person-analysis/);
});

test('blocks a route that exceeds a free user budget', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context, { budget: { tier: 'free', maxCredits: 10 } }).route('Virtual try on');
  assert.equal(decision.cost.withinBudget, false);
  assert.equal(decision.policy.allowed, false);
  assert.equal(decision.executable, false);
  assert.match(decision.policy.violations[0], /exceeds free plan limit/);
});

test('provider failure produces safe degradation and an explanation', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context, { providerAvailability: (id) => id !== 'fashn', debug: true }).route('Virtual try on');
  assert.equal(decision.fallback.required, true);
  assert.deepEqual(decision.alternatives, ['image-edit-preview']);
  assert.match(decision.fallback.reason ?? '', /safe degradation/i);
  assert.equal(decision.debug?.rejected.includes('fashn: unavailable'), true);
});

test('face replacement produces a high identity-risk warning', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context).route('Replace face and make person younger');
  assert.ok(decision.risk.identity >= 0.8);
  assert.match(decision.risk.warnings.join(' '), /identity drift/i);
});

test('identical requests reproduce the same route and policy version', async () => {
  const platform = await createApplication(new ServiceContainer());
  const router = new CapabilityRouter(platform.context);
  const first = await router.route('Change hair color');
  const second = await router.route('Change hair color');
  assert.deepEqual(first.route, second.route);
  assert.equal(first.route.version, '2.4');
});

test('feedback aggregates success, rejection, and duration', () => {
  const feedback = new RoutingFeedback();
  feedback.record('hair-color-v1', 'success', 18000);
  feedback.record('hair-color-v1', 'user-rejected', 20000);
  assert.deepEqual(feedback.getStats('hair-color-v1'), { attempts: 2, successRate: 0.5, rejectionRate: 0.5, averageDurationMs: 19000 });
});
