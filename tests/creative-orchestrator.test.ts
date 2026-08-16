import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { CognitiveLoadEstimator, CreativeOrchestrator, ExpertSelector } from '../src/platform/creative/orchestrator';

const dependencies = () => { let id = 0; return { id: () => `fixed-${++id}`, now: () => 1_700_000_000_000 }; };
const request = (overrides = {}) => ({ tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a', prompt: 'Luxury Fashion Campaign', goals: { quality: .9 }, budget: { total: 20, spent: 2, aiUnitCost: 3, expectedAiValue: .9 }, mode: 'STUDIO' as const, signals: [{ source: 'DIRECTOR' as const, strategy: 'AI' as const, confidence: .85 }, { source: 'STUDIO' as const, strategy: 'AI' as const, confidence: .8 }, { source: 'DECISION' as const, strategy: 'LOCAL' as const, confidence: .6 }], ...overrides });

test('builds an immutable, deterministic executive graph without executing intelligence', () => {
  const first = new CreativeOrchestrator(dependencies()).orchestrate(request());
  const second = new CreativeOrchestrator(dependencies()).orchestrate(request());
  assert.deepEqual(first, second);
  assert.ok(first.plan.graph.nodes.some((node) => node.kind === 'STUDIO'));
  assert.equal(first.finalStrategy, 'AI');
  assert.throws(() => (first.plan.graph.nodes as unknown[]).push({}), /extensible|read only|Cannot add/);
});

test('selects only relevant experts and estimates task load', () => {
  assert.deepEqual(new ExpertSelector().select('Passport Photo', undefined, 20).experts, ['LIGHTING', 'COMPOSITION', 'QUALITY']);
  assert.deepEqual(new ExpertSelector().select('Fashion Campaign', undefined, 60).experts, ['LIGHTING', 'FASHION', 'MARKETING', 'BRAND']);
  assert.equal(new CognitiveLoadEstimator().estimate('Brightness'), 2);
  assert.ok(new CognitiveLoadEstimator().estimate('Luxury Fashion Campaign', { quality: 1 }) >= 60);
});

test('adaptive debate repeats disagreement and reliability changes expert weights', () => {
  const result = new CreativeOrchestrator(dependencies()).orchestrate(request({ signals: [{ source: 'DIRECTOR', strategy: 'AI', confidence: .7 }, { source: 'DECISION', strategy: 'LOCAL', confidence: .7 }], expertHistory: [{ expert: 'LIGHTING', successes: 20, failures: 1, usefulness: .95, domains: { fashion: .9 } }], context: { domain: 'fashion' } }));
  assert.equal(result.debate.length, 2);
  assert.ok(result.debate[0].weights.find((x) => x.expert === 'LIGHTING')!.score > .8);
});

test('budget governor downgrades unaffordable AI and replay enforces complete scope', () => {
  const engine = new CreativeOrchestrator(dependencies());
  const result = engine.orchestrate(request({ budget: { total: 2, spent: 2, aiUnitCost: 3 } }));
  assert.equal(result.budget.recommended, 'LOCAL');
  assert.equal(result.finalStrategy, 'LOCAL');
  assert.deepEqual(engine.replay(result, { tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' }), result);
  assert.throws(() => engine.replay(result, { tenantId: 'tenant-b', projectId: 'project-a', userId: 'user-a' }), /scope violation/);
});

test('explainability and unified timeline expose the complete executive chain', () => {
  const result = new CreativeOrchestrator(dependencies()).orchestrate(request());
  assert.deepEqual(result.explanation.steps.slice(0, 6), ['Prompt', 'Intent', 'Goals', 'Executive Planner', 'Expert Selection', 'Execution Graph']);
  assert.equal(result.explanation.steps.at(-1), 'Global Confidence');
  assert.ok(result.timeline.every((event, index) => event.sequence === index));
  assert.equal(result.confidence.global > 0 && result.confidence.global <= 1, true);
});

test('orchestrator imports stay isolated from forbidden systems', () => {
  const forbidden = [/workflow/i, /runtime/i, /provider/i, /billing/i, /gateway/i, /editing/i, /pipeline/i, /memory.core/i, /agent/i, /react/i, /retired-runtime/i];
  for (const file of readdirSync('src/platform/creative/orchestrator')) {
    if (!file.endsWith('.ts')) continue;
    const dependenciesOnly = readFileSync(join('src/platform/creative/orchestrator', file), 'utf8').split('\n').filter((line) => /^import|^export .* from/.test(line)).join('\n');
    for (const pattern of forbidden) assert.equal(pattern.test(dependenciesOnly), false, `${file} has forbidden dependency ${pattern}`);
  }
});
