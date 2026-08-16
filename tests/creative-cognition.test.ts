import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AssumptionTracker, AttentionManager, CognitiveScheduler, ContradictionEngine, CreativeBlackboard, CreativeCognitiveOS, EvidenceManager, ExecutiveStateMachine, GoalStack, HeuristicAttentionPolicy, HypothesisManager, InsightGenerator, SaliencyEngine, StrategyComposer, SurpriseEngine, ThinkingProgramRegistry, ThoughtGraph, WorkingMemory, immutable } from '../src/platform/creative/cognition';
import type { BlackboardState, CognitiveDependencies, Goal, Thought } from '../src/platform/creative/cognition';

const dependencies = (): CognitiveDependencies => { let id = 0; return { nextId: () => `id-${++id}`, now: () => 1_700_000_000_000, random: () => .5 }; };
const scope = { tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' };
const signals = { novelty: .5, importance: .8, risk: .3, goalImpact: .9, confidence: .7, urgency: .4 };
const thought = (id: string, content = id, saliency = .5): Thought => immutable({ id, type: 'IDEA', content, createdAt: 1, saliency, signals, tags: [] });
const request = (overrides = {}) => ({ ...scope, prompt: 'Create a luxury campaign locally', goals: ['Increase Luxury', 'Reduce Cost', 'Keep Identity'], constraints: ['Local first', 'budget limited'], experts: ['DIRECTOR', 'BRAND', 'COST'], ...overrides });

test('blackboard starts empty and scoped', () => { const state = new CreativeBlackboard().create(scope); assert.equal(state.version, 0); assert.deepEqual(state.goals, []); assert.deepEqual({ tenantId: state.tenantId, projectId: state.projectId, userId: state.userId }, scope); });
test('blackboard writes produce a new version', () => { const board = new CreativeBlackboard(); const initial = board.create(scope); const next = board.write(initial, scope, { risks: ['cost'] }); assert.equal(initial.version, 0); assert.equal(next.version, 1); assert.deepEqual(next.risks, ['cost']); });
test('blackboard rejects cross-tenant access', () => { const board = new CreativeBlackboard(); assert.throws(() => board.write(board.create(scope), { ...scope, tenantId: 'other' }, {}), /scope/); });
test('blackboard rejects cross-project access', () => { const board = new CreativeBlackboard(); assert.throws(() => board.write(board.create(scope), { ...scope, projectId: 'other' }, {}), /scope/); });
test('blackboard rejects cross-user access', () => { const board = new CreativeBlackboard(); assert.throws(() => board.write(board.create(scope), { ...scope, userId: 'other' }, {}), /scope/); });
test('blackboard deduplicates experts', () => { const board = new CreativeBlackboard(); const result = board.write(board.create(scope), scope, { experts: ['BRAND', 'BRAND'] }); assert.deepEqual(result.experts, ['BRAND']); });

test('thought graph orders thoughts by saliency', () => { const graph = ThoughtGraph.build([thought('low', 'low', .1), thought('high', 'high', .9)], []); assert.deepEqual(graph.thoughts.map((item) => item.id), ['high', 'low']); });
test('thought graph validates relations', () => assert.throws(() => ThoughtGraph.build([thought('one')], [{ id: 'relation', from: 'one', to: 'missing', type: 'REQUIRES', weight: 1 }]), /unknown thought/));
test('thought graph rejects duplicate IDs', () => assert.throws(() => ThoughtGraph.build([thought('same'), thought('same')], []), /unique/));
test('saliency combines all six factors', () => assert.equal(new SaliencyEngine().score({ novelty: 1, importance: 1, risk: 1, goalImpact: 1, confidence: 1, urgency: 1 }), 1));

test('working memory retains only its capacity', () => { const attention = attentionFor(emptyState()); const memory = new WorkingMemory(2).update({ thoughts: [thought('1', '1', .1), thought('2', '2', .9), thought('3', '3', .5)], attention }); assert.deepEqual(memory.activeThoughts.map((item) => item.id), ['2', '3']); });
test('working memory rejects invalid capacity', () => assert.throws(() => new WorkingMemory(0), /positive integer/));
test('working memory is deeply immutable', () => { const memory = new WorkingMemory().update({ thoughts: [thought('1')], attention: attentionFor(emptyState()) }); assert.throws(() => (memory.activeThoughts as Thought[]).push(thought('2'))); });

test('attention distribution sums to one', () => { const distribution = attentionFor(emptyState()); assert.ok(Math.abs(Object.values(distribution).reduce((a, b) => a + b, 0) - 1) < 0.000001); });
test('luxury goals focus brand attention', () => { const state = stateWithGoals(['Luxury Brand']); const attention = attentionFor(state); assert.ok(attention.BRAND > attention.EMOTION); });
test('passport goals focus quality attention', () => { const attention = attentionFor(stateWithGoals(['Passport portrait'])); assert.ok(attention.QUALITY > attention.BRAND); });
test('cost constraints focus cost attention', () => { const board = new CreativeBlackboard(); const state = board.write(board.create(scope), scope, { constraints: ['strict budget'] }); assert.ok(attentionFor(state).COST > attentionFor(state).STORY); });

test('goal stack sorts by priority and weight', () => { const goals = [goal('low', 1, .5), goal('high', 10, .8)]; assert.deepEqual(new GoalStack().order(goals).map((item) => item.id), ['high', 'low']); });
test('goal stack validates blockers', () => assert.throws(() => new GoalStack().order([{ ...goal('one', 1, 1), blockingGoalIds: ['missing'] }]), /Unknown blocking/));
test('evidence uses strength and reliability', () => assert.equal(new EvidenceManager().effectiveStrength({ id: 'e', claim: 'x', source: 'test', strength: .8, reliability: .5, createdAt: 1 }), .4));
test('hypothesis becomes supported with evidence', () => { const evidence = { id: 'e', claim: 'soft light', source: 'studio', strength: .9, reliability: .9, createdAt: 1 }; const hypothesis = { id: 'h', statement: 'soft light helps', confidence: .5, evidenceIds: ['e'], counterEvidenceIds: [], expectedGain: .3, verification: 'UNVERIFIED' as const }; assert.equal(new HypothesisManager().evaluate(hypothesis, [evidence]).verification, 'SUPPORTED'); });
test('assumption tracker invalidates unsupported assumptions', () => { const result = new AssumptionTracker().validate({ id: 'a', statement: 'segmentable', confidence: .7, status: 'ACTIVE', createdAt: 1 }, false); assert.equal(result.status, 'INVALIDATED'); assert.ok(result.confidence < .7); });

test('contradiction engine detects Need AI versus No AI', () => { const result = new ContradictionEngine().detect([thought('need', 'Need AI', .8), thought('avoid', 'No AI', .7)], dependencies()); assert.equal(result.length, 1); assert.equal(result[0].winnerId, 'need'); });
test('surprise is emitted above threshold', () => assert.equal(new SurpriseEngine(.2).compare(.2, .8, dependencies()).significant, true));
test('surprise remains insignificant at threshold', () => assert.equal(new SurpriseEngine(.2).compare(.2, .4, dependencies()).significant, false));
test('insights require repeated successful patterns', () => { const insights = new InsightGenerator().generate([{ id: '1', tags: ['soft-light'], success: .9 }, { id: '2', tags: ['soft-light'], success: .8 }]); assert.equal(insights[0].pattern, 'soft-light correlates with successful creative outcomes'); });

test('strategy composer assembles rather than selects traits', () => { const strategy = new StrategyComposer().compose(stateWithGoals(['Luxury', 'Minimal', 'Reduce Cost']), new ThinkingProgramRegistry().all()); assert.deepEqual(strategy.traits, ['LUXURY', 'MINIMAL', 'BUDGET']); });
test('state machine follows deterministic lifecycle', () => assert.deepEqual(new ExecutiveStateMachine().run(), ['IDLE', 'OBSERVE', 'ANALYZE', 'HYPOTHESIS', 'DEBATE', 'EVALUATE', 'REFLECT', 'LEARN', 'FINALIZE']));
test('state machine final state is absorbing', () => assert.equal(new ExecutiveStateMachine().next('FINALIZE'), 'FINALIZE'));

test('cognitive OS is deterministic with identical DI', () => assert.deepEqual(new CreativeCognitiveOS(dependencies()).think(request()), new CreativeCognitiveOS(dependencies()).think(request())));
test('cognitive OS builds complete unified graph', () => { const result = new CreativeCognitiveOS(dependencies()).think(request()); assert.deepEqual(result.graph.nodes.map((node) => node.kind), ['Goal', 'Thought', 'Hypothesis', 'Evidence', 'Experts', 'Debate', 'Consensus', 'Strategy', 'Decision', 'Reflection', 'Learning', 'Insight']); assert.equal(result.graph.edges.length, 11); });
test('cognitive replay reproduces states step by step', () => { const os = new CreativeCognitiveOS(dependencies()); const result = os.think(request()); assert.deepEqual(os.replay(result.id, scope), result.replay); assert.equal(result.replay.length, 9); });
test('cognitive replay enforces full scope', () => { const os = new CreativeCognitiveOS(dependencies()); const result = os.think(request()); assert.throws(() => os.replay(result.id, { ...scope, tenantId: 'other' }), /scope/); });
test('cognitive result is deeply immutable', () => { const result = new CreativeCognitiveOS(dependencies()).think(request()); assert.throws(() => (result.blackboard.goals as Goal[]).push(goal('x', 1, 1))); assert.throws(() => (result.metrics.attentionDistribution as Record<string, number>).BRAND = 0); });
test('all IDs time and randomness come from DI', () => { const os = new CreativeCognitiveOS({ nextId: () => 'fixed', now: () => 77, random: () => .25 }); assert.throws(() => os.think(request()), /unique/); const result = new CreativeCognitiveOS(dependencies()).think(request({ goals: ['one'] })); assert.equal(result.replay[0].at, 1_700_000_000_000); assert.equal(result.blackboard.thoughtGraph.thoughts[0].signals.novelty, .5); });
test('scheduler stops completed work', () => { const complete = stateWithGoals(['done'], 1); const memory = new WorkingMemory().update({ thoughts: [], attention: attentionFor(complete) }); assert.equal(new CognitiveScheduler().decide(complete, memory).action, 'STOP'); });
test('forbidden imports are absent', () => { const forbidden = [/from ['"].*\/decision/i, /from ['"].*\/director/i, /from ['"].*\/studio/i, /from ['"].*\/meta/i, /from ['"].*\/workflow/i, /from ['"].*\/runtime/i, /from ['"].*\/provider/i, /from ['"]react/i, /from ['"].*\/billing/i, /from ['"].*\/gateway/i, /from ['"].*\/application/i, /from ['"]@retired-runtime/i]; for (const file of readdirSync('src/platform/creative/cognition')) { if (!file.endsWith('.ts')) continue; const imports = readFileSync(join('src/platform/creative/cognition', file), 'utf8').split('\n').filter((line) => /^import|^export .* from/.test(line)).join('\n'); for (const pattern of forbidden) assert.equal(pattern.test(imports), false, `${file} imports forbidden ${pattern}`); } });

function goal(id: string, priority: number, weight: number): Goal { return immutable({ id, title: id, priority, weight, completion: 0, blockingGoalIds: [] }); }
function emptyState(): BlackboardState { return new CreativeBlackboard().create(scope); }
function stateWithGoals(titles: readonly string[], completion = 0): BlackboardState { const board = new CreativeBlackboard(); return board.write(board.create(scope), scope, { goals: titles.map((title, index) => ({ ...goal(`g${index}`, 10 - index, 1), title, completion })) }); }
function attentionFor(state: BlackboardState) { return new AttentionManager(new HeuristicAttentionPolicy()).distribute(state); }
