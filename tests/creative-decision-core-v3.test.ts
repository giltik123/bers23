import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CreativeDNAEngine, CreativeDecisionIntelligenceCore, CreativeDiscoveryEngine,
  CreativeReasoningTree, CreativeSatisfactionModel, CreativeStrategyLibrary,
  CreativeWorldModel, DecisionArchetypeEngine, DecisionEconomics,
  DecisionFatigueModel, DecisionGraphMemory, DecisionPatternDiscovery,
  DecisionProvenance, DecisionSelfCritic, DecisionSimulator,
  HeuristicDecisionModel, LongTermLearning, MetaLearningEngine,
  ReversePlanningEngine, StyleSpace, UnifiedIntelligenceDebuggerV4,
} from '../src/platform/creative/decision/intelligence/core';

const scope = Object.freeze({ tenantId: 't', projectId: 'p', userId: 'u' });

test('graph traversal, analysis and immutable snapshots', () => {
  const graph = new DecisionGraphMemory().add({ id: 'decision', kind: 'Decision', scope }).add({ id: 'goal', kind: 'Goal', scope }).add({ id: 'outcome', kind: 'Outcome', scope }).connect('decision', 'goal', { confidence: .8 }).connect('goal', 'outcome');
  assert.deepEqual(graph.shortestPath('decision', 'outcome', scope), ['decision', 'goal', 'outcome']);
  assert.equal(graph.findRelated('decision', 2, scope).length, 2);
  assert.equal(graph.centralNodes(1)[0].id, 'goal');
  assert.throws(() => (graph.snapshot.nodes as any).push({}));
});

test('graph isolation excludes another tenant', () => {
  const other = { ...scope, tenantId: 'other' };
  const graph = new DecisionGraphMemory().add({ id: 'a', kind: 'Decision', scope }).add({ id: 'b', kind: 'Decision', scope: other });
  assert.throws(() => graph.connect('a', 'b'), /Cross-scope/);
  assert.throws(() => graph.add({ id: 'a', kind: 'Decision', scope: other }), /another scope/);
});

test('pattern discovery calculates lifecycle metrics', () => {
  const patterns = new DecisionPatternDiscovery().discover([{ scope, operations: ['light', 'contrast'], accepted: true, quality: .8, timestamp: 1 }, { scope, operations: ['light', 'contrast'], accepted: false, undo: true, quality: .6, timestamp: 5 }], 5);
  assert.equal(patterns[0].frequency, 2); assert.equal(patterns[0].undo, 1); assert.equal(patterns[0].lifetime, 4);
});

test('pattern discovery never combines user scopes', () => {
  const other = { ...scope, userId: 'other' };
  const patterns = new DecisionPatternDiscovery().discover([
    { scope, operations: ['crop'], accepted: true }, { scope, operations: ['crop'], accepted: true },
    { scope: other, operations: ['crop'], accepted: false }, { scope: other, operations: ['crop'], accepted: false },
  ]);
  assert.equal(patterns.length, 2);
  assert.notEqual(patterns[0].acceptance, patterns[1].acceptance);
});

test('archetypes emerge and merge dynamically', () => {
  const engine = new DecisionArchetypeEngine();
  const archetypes = engine.create([{ scope, operations: ['lighting'], goals: ['catalog'], preferences: ['luxury'], quality: .8 }, { scope, operations: ['contrast'], goals: ['portrait'], quality: .7 }]);
  assert.equal(engine.merge(archetypes[0], archetypes[1]).members, 2);
});

test('archetypes reject cross-scope merging', () => {
  const engine = new DecisionArchetypeEngine(), other = { ...scope, projectId: 'other' };
  const archetypes = engine.create([{ scope, operations: ['a'], goals: ['catalog'] }, { scope: other, operations: ['b'], goals: ['catalog'] }]);
  assert.throws(() => engine.merge(archetypes[0], archetypes[1]), /Cross-scope/);
});

test('Creative DNA evolves gradually and creates generations', () => {
  const engine = new CreativeDNAEngine(.1), v1 = engine.initial({ luxury: .5 }), v2 = engine.evolve(v1, { style: { luxury: 1 }, risk: 1 });
  assert.equal(v2.generation, 2); assert.equal(v2.style.luxury, .55); assert.equal(v2.risk, .55);
});

test('simulator returns at least ten ranked futures', () => {
  const futures = new DecisionSimulator().simulate(['lighting', 'contrast']);
  assert.equal(futures.length, 10); assert.ok(futures[0].utility >= futures[1].utility);
});

test('economics distinguishes useful and wasteful AI', () => {
  const e = new DecisionEconomics();
  assert.equal(e.evaluate({ baselineQuality: .4, expectedQuality: .9, cost: 10, isAI: true }).recommendation, 'AI_JUSTIFIED');
  assert.equal(e.evaluate({ baselineQuality: .8, expectedQuality: .8, cost: 10, isAI: true }).recommendation, 'STOP');
});

test('meta learning reports errors and updates weights', () => {
  const weights = { prediction: .5, confidence: .5, utility: .5, quality: .5, satisfaction: .5 };
  const result = new MetaLearningEngine().adapt(weights, { quality: .5 }, { quality: .8 });
  assert.equal(result.errors.qualityError, .3); assert.ok(result.weights.quality < weights.quality);
});

test('long-term learning forgets stale observations', () => {
  const result = new LongTermLearning().evaluate([{ timestamp: 0, accepted: true }, { timestamp: 100, undo: true }], 1000, 100);
  assert.ok(result.forgotten > 1); assert.ok(result.experience < 1);
});

test('fatigue model measures independent overload types', () => {
  const result = new DecisionFatigueModel().evaluate({ choices: 30, confirmations: 10, creativeBranches: 20, decisions: 40 });
  assert.equal(result.score, 1); assert.equal(result.recommendation, 'Automatic mode');
});

test('satisfaction remains distinct from technical quality', () => {
  const result = new CreativeSatisfactionModel().evaluate({ technicalQuality: 1, creativeQuality: .2, goalCompletion: .5, userSatisfaction: .3, confidence: .8, expectedQuality: .9 });
  assert.equal(result.technicalQuality, 1); assert.equal(result.expectationGap, .6);
});

test('reverse planning works from desired result', () => {
  const result = new ReversePlanningEngine().plan({ desiredResult: 'ad', targetStyle: 'luxury', requiredQuality: .9, availableOperations: ['crop', 'luxury_light'] });
  assert.equal(result.executionPlan[0].operation, 'luxury_light');
});

test('reasoning tree expands, prunes and selects branches', () => {
  const result = new CreativeReasoningTree().build('make it premium', ['luxury'], [{ value: 'a', confidence: .2, utility: 2 }, { value: 'b', confidence: .9, utility: 1 }]);
  assert.equal(result.branches[0].pruningReason, 'low confidence'); assert.equal(result.selected?.alternative, 'b');
});

test('self critic analyzes without changing the decision', () => {
  const decision = Object.freeze({ quality: .5, risk: .8, cost: 5, operations: ['x'] });
  const result = new DecisionSelfCritic().analyze(decision, ['y']);
  assert.deepEqual(decision.operations, ['x']); assert.ok(result.risks.length); assert.ok(result.improvementSuggestions.length);
});

test('strategy library contains the eleven requested strategies', () => {
  const library = new CreativeStrategyLibrary(); assert.equal(library.list().length, 11); assert.equal(library.get('luxury')?.id, 'Luxury');
});

test('decision model supports its complete replaceable contract', () => {
  const model = new HeuristicDecisionModel().train([{ id: '1', features: { warmth: .8 }, outcome: { quality: .9 }, accepted: true }]);
  assert.match(model.version(), /^heuristic-v/); assert.equal(model.rank([{ id: '1', features: { warmth: .8 }, outcome: {} }]).length, 1); assert.equal(model.simulate({ warmth: .8 }).length, 10); assert.equal(model.importDataset(model.exportDataset()).explain({ warmth: .5 }).model, 'heuristic');
});

test('world model updates knowledge immutably and infers relations', () => {
  const empty = new CreativeWorldModel(), model = empty.update('Luxury', ['warm']).update('warm', ['lighting']);
  assert.deepEqual(empty.query('Luxury'), []); assert.deepEqual(model.infer('Luxury'), ['warm', 'lighting']);
});

test('style space provides continuous geometry', () => {
  const space = new StyleSpace(); assert.equal(space.distance({ warmth: 0 }, { warmth: 1 }), 1); assert.deepEqual(space.interpolate({ warmth: 0 }, { warmth: 1 }), { warmth: .5 });
});

test('provenance normalizes all decision origins', () => {
  const result = new DecisionProvenance().calculate({ Preference: 18, Knowledge: 23, History: 16, Pattern: 27, Rules: 9, Simulation: 7 });
  assert.equal(Object.values(result).reduce((a, b) => a + b, 0), 1); assert.equal(result.Pattern, .27);
});

test('discovery finds creative alternatives instead of only utility winners', () => {
  const candidates = new DecisionSimulator().simulate(['a', 'b']); const result = new CreativeDiscoveryEngine().discover(candidates);
  assert.equal(result.length, 5); assert.ok(result.every(x => typeof x.discoveryScore === 'number'));
});

test('debugger emits the complete v4 chain', () => {
  const trace = new UnifiedIntelligenceDebuggerV4().trace({ Prompt: 'x', Decision: 'y' }); assert.equal(trace.stages.length, 23); assert.match(trace.text, /Learning Statistics/);
});

test('facade uses dependency injection and is deterministic', () => {
  const dependencies = { model: new HeuristicDecisionModel(), clock: () => 42, id: () => 'decision-1' };
  const result = new CreativeDecisionIntelligenceCore(dependencies).decide(scope, { luxury: .8 }); assert.equal(result.id, 'decision-1'); assert.equal(result.createdAt, 42); assert.throws(() => (result.scope as any).tenantId = 'x');
});

// One hundred deterministic matrix cases supplement the 22 behavioral tests above.
// They exercise repeatability, bounds and immutability across a broad style space.
for (let index = 0; index < 100; index += 1) {
  test(`deterministic intelligence matrix ${String(index + 1).padStart(3, '0')}`, () => {
    const value = index / 99, model = new HeuristicDecisionModel(), first = model.predict({ style: value, creativity: 1 - value }), second = model.predict({ style: value, creativity: 1 - value });
    assert.deepEqual(first, second); assert.ok(first.quality >= 0 && first.quality <= 1); assert.ok(first.risk >= 0 && first.risk <= 1); assert.equal(Object.isFrozen(first), true);
  });
}
