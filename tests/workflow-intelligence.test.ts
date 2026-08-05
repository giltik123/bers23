import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowAnalytics } from '../src/platform/workflow/intelligence/WorkflowAnalytics.ts';
import { WorkflowOptimizer } from '../src/platform/workflow/intelligence/WorkflowOptimizer.ts';
import { WorkflowRanker } from '../src/platform/workflow/intelligence/WorkflowRanker.ts';
import { WorkflowRecommendation } from '../src/platform/workflow/intelligence/WorkflowRecommendation.ts';
import { WorkflowVersioning } from '../src/platform/workflow/intelligence/WorkflowVersioning.ts';

const executions = [
  { workflowId: 'workflow-a', status: 'completed', durationMs: 100, cost: { credits: 10 }, qualitySignals: { catalogScore: 0.91 } },
  { workflowId: 'workflow-a', status: 'completed', durationMs: 120, cost: { credits: 11 }, qualitySignals: { catalogScore: 0.88 } },
  { workflowId: 'workflow-a', status: 'completed', durationMs: 90, cost: { credits: 9 }, qualitySignals: { catalogScore: 0.9 } },
  { workflowId: 'workflow-b', status: 'failed', durationMs: 80, cost: { credits: 6 }, providerFailures: ['fashn'], qualitySignals: { catalogScore: 0.72 } },
  { workflowId: 'workflow-b', status: 'completed', durationMs: 85, cost: { credits: 6 }, qualitySignals: { catalogScore: 0.74 } },
];

const snapshots = new WorkflowAnalytics().summarizeAll(['workflow-a', 'workflow-b'], executions, [{ workflowId: 'workflow-b', provider: 'fashn', failures: 1 }]);

test('Ranking: workflow A лучше workflow B по истории', () => {
  const ranked = new WorkflowRanker().rank(snapshots.map((analytics) => ({ workflowId: analytics.workflowId, analytics })));
  assert.equal(ranked[0].workflowId, 'workflow-a');
  assert.ok(ranked[0].score > ranked[1].score);
  assert.equal(snapshots.find((item) => item.workflowId === 'workflow-b').providerFailures.fashn, 2);
});

test('Cost optimization: дешёвый workflow выбирается при Free', () => {
  const recommendation = new WorkflowRecommendation().recommend('улучши изображение', { plan: 'Free', workflowAnalytics: snapshots });
  assert.equal(recommendation.workflow, 'workflow-b');
});

test('Quality optimization: Studio выбирает quality workflow', () => {
  const recommendation = new WorkflowRecommendation().recommend('улучши изображение', { plan: 'Studio', workflowAnalytics: snapshots });
  assert.equal(recommendation.workflow, 'workflow-a');
});

test('WorkflowOptimizer advisory-only возвращает рекомендацию без изменения workflow', () => {
  const advice = new WorkflowOptimizer().advise('workflow-b', snapshots.map((analytics) => ({ workflowId: analytics.workflowId, analytics })));
  assert.equal(advice.currentWorkflow, 'workflow-b');
  assert.equal(advice.recommendedWorkflow, 'workflow-a');
  assert.ok(advice.confidence > 0.6);
  assert.ok(advice.expectedImprovement > 0);
});

test('Versioning: v2 наследует v1', () => {
  const versioning = new WorkflowVersioning();
  const v1 = versioning.create('virtual-try-on', 'v1', 'Initial production workflow', { createdAt: 1 });
  const v2 = versioning.create('virtual-try-on', 'v2', 'Add SAM3 + Scene Memory + Reve quality pass', { parentVersion: v1.version, createdAt: 2 });
  assert.equal(v2.parentVersion, 'v1');
  assert.deepEqual(versioning.lineage('virtual-try-on').map((item) => item.version), ['v1', 'v2']);
  assert.equal(versioning.latest('virtual-try-on').version, 'v2');
});

test('Recommendation: prompt "сделай фото для каталога" возвращает virtual-try-on', () => {
  const recommendation = new WorkflowRecommendation().recommend('сделай фото для каталога');
  assert.equal(recommendation.workflow, 'virtual-try-on');
  assert.ok(recommendation.confidence >= 0.8);
  assert.match(recommendation.explanation, /virtual-try-on/);
});
