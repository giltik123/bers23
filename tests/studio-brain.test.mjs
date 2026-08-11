import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeStudioBrain } from '../src/platform/creative/studio-brain/StudioBrain.ts';

test('studio brain produces independent debate, consensus, memory, and replay', () => {
  let id = 0;
  const brain = new CreativeStudioBrain({ nextId: () => `id-${++id}`, now: () => 1_700_000_000_000 });
  const trace = brain.think({ projectId: 'luxury-1', text: 'Luxury jewelry catalog with a warm cinematic mood', domain: 'LUXURY', budget: 35 });
  assert.equal(trace.experts.length, 10);
  assert.equal(new Set(trace.experts.map((opinion) => opinion.role)).size, 10);
  assert.ok(trace.debate.statements.length >= 10);
  assert.ok(trace.consensus.operations.includes('LOCAL'));
  assert.equal(trace.identity.creative.values.length, 128);
  assert.equal(trace.visualLaws.length, 11);
  assert.equal(trace.tradeoffs.length, 5);
  assert.equal(brain.replay.replay(trace.id).decision, trace.decision);
  assert.equal(brain.timeline.all().length, 1);
  assert.equal(brain.knowledge.query('LUXURY').length, 1);
  assert.ok(Object.values(trace.creativeIQ).every((score) => score >= 0 && score <= 1));
});

test('strategy and studio knowledge evolve without becoming user memory', () => {
  let id = 0;
  let now = 10;
  const brain = new CreativeStudioBrain({ nextId: () => `e-${++id}`, now: () => ++now });
  brain.think({ projectId: 'a', text: 'Consistent fashion catalog', domain: 'FASHION' });
  const second = brain.think({ projectId: 'b', text: 'Consistent fashion catalog', domain: 'FASHION' });
  assert.equal(second.strategy.version, 2);
  assert.equal(brain.strategies.history('FASHION').length, 2);
  assert.ok(brain.knowledge.query('FASHION').some((knowledge) => knowledge.support >= 2));
  assert.deepEqual(Object.keys(brain.debugger.inspect(second)), ['prompt', 'intent', 'goals', 'experts', 'debate', 'consensus', 'tradeoffs', 'knowledge', 'identity', 'reasoning', 'decision', 'expectedResult', 'creativeIQ']);
});
