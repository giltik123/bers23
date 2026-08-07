import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  CreativeKnowledgeReasoner,
  CreativeKnowledgeSystem,
  EvidenceAccumulator,
  KnowledgeConfidence,
  KnowledgeContradictionResolver,
  KnowledgeCoverageAnalyzer,
  KnowledgeExplainability,
  KnowledgeGapPlanner,
  KnowledgeInferenceEngine,
  KnowledgePlanner,
  KnowledgeQuery,
  KnowledgeRanker,
  KnowledgeSimulation,
  SemanticReasoner,
  type KnowledgeDependencies,
  type KnowledgeScope,
} from '../src/platform/creative/knowledge';

const scope: KnowledgeScope = { tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' };
const otherScope: KnowledgeScope = { tenantId: 'tenant-b', projectId: 'project-b', userId: 'user-b' };
const dependencies = (): KnowledgeDependencies => {
  let id = 0;
  let time = 1000;
  return { id: () => `reasoning-${++id}`, now: () => ++time, random: () => 0.25 };
};

const fixture = () => {
  const knowledgeDependencies = dependencies();
  const reasoningDependencies = dependencies();
  const knowledge = new CreativeKnowledgeSystem(knowledgeDependencies);
  const concepts = [
    'Luxury', 'Gold palette', 'Soft lighting', 'Warm reflections',
    'Low contrast', 'Premium perception', 'Alternative editorial',
  ].map((concept, index) => knowledge.graph().addNode({
    scope,
    concept,
    category: index === 0 ? 'goal' : 'visual',
    tags: ['creative', `depth-${index}`],
    confidence: 0.96 - index * 0.04,
    importance: 0.9 - index * 0.03,
    support: 10 - index,
    evidenceCount: 8 - index,
  }));
  for (let index = 0; index < 5; index += 1) {
    knowledge.graph().addEdge({ source: concepts[index].id, target: concepts[index + 1].id, relation: 'leads-to', weight: 0.95 - index * 0.05, confidence: 0.94 - index * 0.04, support: 8 - index });
  }
  knowledge.graph().addEdge({ source: concepts[0].id, target: concepts[6].id, relation: 'related', weight: 0.5, confidence: 0.7, support: 2 });
  const isolated = knowledge.graph().addNode({ scope: otherScope, concept: 'Private tenant concept', category: 'private', tags: [], confidence: 1, importance: 1, support: 10, evidenceCount: 10 });
  return { knowledge, reasoner: new CreativeKnowledgeReasoner({ knowledge, dependencies: reasoningDependencies }), concepts, isolated };
};

const request = (overrides = {}) => ({ scope, goal: 'luxury', facts: ['Luxury'], maxDepth: 5, ...overrides });

test('facade requires all dependencies', () => assert.throws(() => new CreativeKnowledgeReasoner({} as never)));
test('forward inference returns injected id and time', () => { const result = fixture().reasoner.forward(request()); assert.equal(result.id, 'reasoning-1'); assert.equal(result.createdAt, 1001); });
test('forward inference preserves scope', () => assert.deepEqual(fixture().reasoner.forward(request()).scope, scope));
test('forward inference creates conclusions', () => assert.ok(fixture().reasoner.forward(request()).conclusions.length >= 5));
test('forward inference activates luxury rule', () => assert.ok(fixture().reasoner.forward(request()).activatedRules.some((item) => item.ruleId === 'luxury-direction')));
test('forward inference captures graph evidence', () => assert.ok(fixture().reasoner.forward(request()).evidence.items.some((item) => item.kind === 'graph')));
test('forward inference captures rule evidence', () => assert.ok(fixture().reasoner.forward(request()).evidence.items.some((item) => item.kind === 'rule')));
test('forward inference builds an inference tree', () => assert.equal(fixture().reasoner.forward(request()).inferenceTree.length, 5));
test('forward inference builds a knowledge path', () => assert.ok(fixture().reasoner.forward(request()).knowledgePath.includes('Premium perception')));
test('forward inference proposes alternatives', () => assert.ok(Array.isArray(fixture().reasoner.forward(request()).alternatives)));
test('reason aliases infer', () => assert.deepEqual(fixture().reasoner.reason(request()).knowledgePath, fixture().reasoner.infer(request()).knowledgePath));

for (const depth of [1, 2, 3, 4, 5]) {
  test(`multi-hop reasoning respects depth ${depth}`, () => {
    const result = fixture().reasoner.infer(request({ maxDepth: depth }));
    const expected = ['Gold palette', 'Warm reflections', 'Low contrast', 'Premium perception', 'Premium perception'];
    assert.ok(result.conclusions.some((item) => item.concept === expected[depth - 1]));
  });
}

test('backward chaining satisfies a reachable goal', () => { const result = fixture().reasoner.backward(request({ goal: 'Premium perception' })); assert.equal(result.satisfied, true); assert.deepEqual(result.path, ['Luxury', 'Gold palette', 'Soft lighting', 'Warm reflections', 'Low contrast', 'Premium perception']); });
test('backward chaining satisfies a supplied goal', () => assert.equal(fixture().reasoner.backward(request({ goal: 'Luxury' })).confidence, 1));
test('backward chaining reports missing rule facts', () => { const result = fixture().reasoner.backward(request({ goal: 'soft lighting', facts: [] })); assert.ok(result.neededFacts.includes('luxury')); });
test('backward chaining rejects unreachable goal', () => assert.equal(fixture().reasoner.backward(request({ goal: 'Unknown' })).satisfied, false));
test('planner starts with goal', () => assert.equal(fixture().reasoner.plan(request()).steps[0].type, 'goal'));
test('planner contains activated rules', () => assert.ok(fixture().reasoner.plan(request()).activatedRules.includes('luxury-direction')));
test('planner contains inference', () => assert.ok(fixture().reasoner.plan(request()).inference.includes('Gold palette')));
test('planner contains recommendations', () => assert.ok(fixture().reasoner.plan(request()).recommendations.length > 0));
test('planner uses injected identifiers', () => assert.equal(fixture().reasoner.plan(request()).id, 'reasoning-2'));

test('evidence accumulator deduplicates evidence', () => { const accumulator = new EvidenceAccumulator(); const item = { id: 'one', kind: 'fact' as const, description: 'fact', confidence: 0.8, support: 2 }; assert.equal(accumulator.accumulate([[item], [item]]).items.length, 1); });
test('evidence accumulator prefers strongest duplicate', () => { const result = new EvidenceAccumulator().accumulate([[{ id: 'one', kind: 'fact', description: 'weak', confidence: 0.2, support: 1 }, { id: 'one', kind: 'graph', description: 'strong', confidence: 0.9, support: 4 }]]); assert.equal(result.items[0].description, 'strong'); });
test('evidence accumulator applies conflict penalty', () => { const accumulator = new EvidenceAccumulator(); const item = { id: 'one', kind: 'fact' as const, description: 'fact', confidence: 1, support: 1 }; assert.ok(accumulator.accumulate([[item]], [['a', 'b']]).confidence < accumulator.accumulate([[item]]).confidence); });
test('evidence accumulator freezes nested data', () => { const result = new EvidenceAccumulator().accumulate([[{ id: 'one', kind: 'fact', description: 'fact', confidence: 1, support: 1 }]]); assert.ok(Object.isFrozen(result.items)); assert.ok(Object.isFrozen(result.items[0])); });

test('confidence combines all signals', () => assert.ok(new KnowledgeConfidence().calculate({ ruleConfidence: 1, graphConfidence: 1, ontologyConfidence: 1, evidenceConfidence: 1, support: 1, conflicts: 0, coverage: 1 }).value > 0.99));
test('confidence clamps signals', () => assert.equal(new KnowledgeConfidence().calculate({ ruleConfidence: 3, graphConfidence: 3, ontologyConfidence: 3, evidenceConfidence: 3, support: 3, conflicts: 0, coverage: 3 }).value, 1));
test('confidence penalizes contradictions', () => { const model = new KnowledgeConfidence(); const clean = model.calculate({ ruleConfidence: 1, graphConfidence: 1, ontologyConfidence: 1, evidenceConfidence: 1, support: 1, conflicts: 0, coverage: 1 }); const conflict = model.calculate({ ...clean, conflicts: 2 }); assert.ok(conflict.value < clean.value); });

test('contradiction resolver detects negative recommendation', () => { const resolver = new KnowledgeContradictionResolver(); assert.deepEqual(resolver.detect([{ id: 'a', value: 'warm', confidence: 1, support: 1, priority: 1 }, { id: 'b', value: 'not warm', confidence: 1, support: 1, priority: 1 }]), [['a', 'b']]); });
test('contradiction resolver chooses higher priority', () => { const result = new KnowledgeContradictionResolver().resolve([{ id: 'low', value: 'warm', confidence: 1, support: 1, priority: 1 }, { id: 'high', value: 'cool', confidence: 1, support: 1, priority: 10 }]); assert.equal(result.winner?.id, 'high'); });
test('contradiction resolver uses confidence after priority', () => { const result = new KnowledgeContradictionResolver().resolve([{ id: 'low', value: 'warm', confidence: 0.2, support: 1, priority: 1 }, { id: 'high', value: 'cool', confidence: 0.9, support: 1, priority: 1 }]); assert.equal(result.winner?.id, 'high'); });
test('contradiction resolver handles empty candidates', () => assert.equal(new KnowledgeContradictionResolver().resolve([]).winner, undefined));

test('semantic reasoner finds related concepts', () => assert.ok(fixture().reasoner.semantic.relatedConcepts('Luxury', scope).length > 0));
test('semantic reasoner finds implicit knowledge', () => assert.ok(fixture().reasoner.semantic.implicitKnowledge('Luxury', scope).some((item) => item.node.concept === 'Premium perception')));
test('semantic reasoner exposes hidden relations', () => assert.ok(fixture().reasoner.semantic.hiddenRelations('Luxury', scope).length > 0));
test('semantic reasoner finds nearest concepts', () => assert.equal(fixture().reasoner.semantic.nearestConcepts('Luxury', scope)[0].node.concept, 'Gold palette'));
test('semantic reasoner builds bridges', () => assert.equal(fixture().reasoner.semantic.semanticBridges('Luxury', 'Premium perception', scope).length, 4));
test('semantic reasoner does not bridge direct concepts', () => assert.equal(fixture().reasoner.semantic.semanticBridges('Luxury', 'Gold palette', scope).length, 0));

test('coverage distinguishes known and unknown', () => { const { knowledge } = fixture(); const result = new KnowledgeCoverageAnalyzer(knowledge).analyze(['Luxury', 'Unknown'], scope); assert.deepEqual(result.known, ['Luxury']); assert.deepEqual(result.unknown, ['Unknown']); });
test('coverage detects weak knowledge', () => { const { knowledge } = fixture(); knowledge.graph().addNode({ scope, concept: 'Weak', category: 'test', tags: [], confidence: 0.2, importance: 0.2, support: 0, evidenceCount: 0 }); assert.deepEqual(new KnowledgeCoverageAnalyzer(knowledge).analyze(['Weak'], scope).weak, ['Weak']); });
test('coverage of empty request is complete', () => assert.equal(new KnowledgeCoverageAnalyzer(fixture().knowledge).analyze([], scope).value, 1));
test('gap planner creates missing knowledge tasks', () => { const result = new KnowledgeGapPlanner().plan({ known: [], unknown: ['Lighting'], missing: ['Lighting'], conflicting: [], weak: [], value: 0 }); assert.match(result.gaps[0].need, /Lighting/); });
test('gap planner prioritizes missing over weak', () => { const result = new KnowledgeGapPlanner().plan({ known: ['Weak'], unknown: ['Missing'], missing: ['Missing'], conflicting: [], weak: ['Weak'], value: 0 }); assert.equal(result.gaps[0].concept, 'Missing'); });
test('gap planner completes full coverage', () => assert.equal(new KnowledgeGapPlanner().plan({ known: ['A'], unknown: [], missing: [], conflicting: [], weak: [], value: 1 }).complete, true));

test('ranker sorts by deterministic score', () => { const { knowledge } = fixture(); const ranked = new KnowledgeRanker().rank(knowledge.graph().nodes(scope)); assert.ok(ranked[0].score >= ranked[1].score); });
test('ranker accounts for utility', () => { const { knowledge, concepts } = fixture(); const ranked = new KnowledgeRanker().rank(knowledge.graph().nodes(scope), { utility: { [concepts[5].id]: 1, [concepts[0].id]: 0 } }); assert.ok(ranked.find((item) => item.node.id === concepts[5].id)!.signals.utility === 1); });
test('ranker freezes signals', () => assert.ok(Object.isFrozen(new KnowledgeRanker().rank(fixture().knowledge.graph().nodes(scope))[0].signals)));

test('simulation estimates quality', () => { const inference = fixture().reasoner.infer(request()); assert.ok(new KnowledgeSimulation().simulate({ inference }).expectedQuality > 0); });
test('simulation sums operation costs', () => { const inference = fixture().reasoner.infer(request()); const concept = inference.conclusions[0].concept; assert.equal(new KnowledgeSimulation().simulate({ inference, operationCosts: { [concept]: 3 } }).expectedCost, 3); });
test('simulation averages risk signals', () => { const inference = fixture().reasoner.infer(request()); assert.equal(new KnowledgeSimulation().simulate({ inference, riskSignals: [0.2, 0.4] }).expectedRisk, 0.30000000000000004); });
test('simulation is immutable', () => assert.ok(Object.isFrozen(fixture().reasoner.simulate({ inference: fixture().reasoner.infer(request()) }))));

test('explanation follows required stages', () => { const { reasoner } = fixture(); const explanation = reasoner.explain(reasoner.infer(request())); for (const stage of ['Goal:', 'Knowledge:', 'Rules:', 'Evidence:', 'Inference:', 'Recommendation:']) assert.match(explanation.narrative, new RegExp(stage)); });
test('explanation includes recommendation list', () => { const { reasoner } = fixture(); assert.ok(reasoner.explain(reasoner.infer(request())).recommendations.length > 0); });
test('query finds concept', () => { const { reasoner } = fixture(); assert.equal(reasoner.queries.findConcept('Luxury', scope)?.concept, 'Luxury'); });
test('query finds rules', () => assert.ok(fixture().reasoner.queries.findRules('luxury').some((rule) => rule.id === 'luxury-direction')));
test('query finds graph evidence', () => { const { reasoner } = fixture(); const inference = reasoner.infer(request()); assert.ok(reasoner.queries.findEvidence(inference.evidence, 'graph').length > 0); });
test('query finds reasoning relations', () => { const { reasoner } = fixture(); assert.ok(reasoner.queries.findReasoning(reasoner.infer(request()), 'leads-to').length > 0); });
test('query filters recommendations by confidence', () => { const { reasoner } = fixture(); assert.ok(reasoner.queries.findRecommendations(reasoner.infer(request()), 0.8).length > 0); });

test('snapshot contains facts and rules', () => { const result = fixture().reasoner.snapshot(request()); assert.ok(result.facts.length > 0); assert.ok(result.rules.length > 0); });
test('snapshot contains inference and recommendations', () => { const result = fixture().reasoner.snapshot(request()); assert.ok(result.inferenceTree.length > 0); assert.ok(result.recommendations.length > 0); });
test('snapshot contains confidence and coverage', () => { const result = fixture().reasoner.snapshot(request()); assert.ok(result.confidence.value > 0); assert.ok(result.coverage.value > 0); });
test('snapshot contains contradictions and gaps', () => { const result = fixture().reasoner.snapshot(request()); assert.ok(Array.isArray(result.contradictions)); assert.ok(Object.isFrozen(result.gaps)); });
test('snapshot is deeply immutable', () => { const result = fixture().reasoner.snapshot(request()); assert.throws(() => (result.recommendations as string[]).push('mutate')); assert.ok(Object.isFrozen(result.scope)); });
test('debug exposes complete inference state', () => { const { reasoner } = fixture(); reasoner.infer(request()); const debug = reasoner.debug(); assert.equal(debug.goal, 'luxury'); assert.ok(debug.tree.length > 0); });
test('validate accepts complete request', () => assert.equal(fixture().reasoner.validate(request()).valid, true));
test('validate rejects empty goal', () => assert.equal(fixture().reasoner.validate(request({ goal: '' })).valid, false));

test('reasoning excludes other tenant concepts', () => assert.ok(!fixture().reasoner.infer(request()).knowledgePath.includes('Private tenant concept')));
test('semantic search excludes other projects and users', () => assert.ok(!fixture().reasoner.semantic.nearestConcepts('Luxury', scope).some((item) => item.node.concept === 'Private tenant concept')));
test('same inputs produce identical reasoning', () => assert.deepEqual(fixture().reasoner.infer(request()), fixture().reasoner.infer(request())));
test('fresh injected dependencies reproduce results', () => assert.deepEqual(fixture().reasoner.snapshot(request()), fixture().reasoner.snapshot(request())));
test('random source is never used for inference', () => { let calls = 0; const { knowledge } = fixture(); const reasoner = new CreativeKnowledgeReasoner({ knowledge, dependencies: { id: () => 'fixed', now: () => 1, random: () => { calls += 1; return 0.5; } } }); reasoner.infer(request()); assert.equal(calls, 0); });
test('reasoning layer has no forbidden imports', () => { const directory = 'src/platform/creative/knowledge/reasoning'; const forbidden = ['runtime', 'kernel', 'decision', 'director', 'studio', 'workflow', 'provider', 'billing', 'application', 'ui', 'react', 'base44']; for (const file of readdirSync(directory)) { if (!file.endsWith('.ts')) continue; const imports = readFileSync(`${directory}/${file}`, 'utf8').split('\n').filter((line) => /^import|^export .* from/.test(line)).join('\n').toLowerCase(); for (const term of forbidden) assert.equal(imports.includes(term), false, `${file} imports ${term}`); } });
