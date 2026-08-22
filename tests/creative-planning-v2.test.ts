import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { CanonicalDecisionService, CanonicalPlanningService, CreativeExecutionPlatform, rankAndFilter, scoreCandidate, validateCreativePlan, type CreativePlan, type CreativePlanCandidate, type CreativePlanConstraints, type CreativeRequest } from '../src/platform/creative/canonical/index.ts';

const scope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const base = (metadata: Record<string, unknown> = {}): CreativeRequest => ({ id: 'plan-v2', intent: 'remove subject, replace background, and relight', scope, inputArtifacts: [{ id: 'original', kind: 'image', value: {}, producerOperationId: 'seed', scope, state: 'AVAILABLE', role: 'ORIGINAL' }], metadata });
const plan = async (metadata: Record<string, unknown> = {}) => { const request = base(metadata); return new CanonicalPlanningService().plan(request, await new CanonicalDecisionService().decide(request)); };

test('composite intent creates a deterministic five-step DAG and multiple ranked candidates', async () => {
  const first = await plan({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT' }); const second = await plan({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT' });
  assert.deepEqual(first, second); assert.equal(first.status, 'READY'); assert.equal(first.operations.length, 5); assert.deepEqual(first.operations.map(item => item.type), ['segment', 'remove', 'background_replace', 'relight', 'verify']);
  assert.deepEqual(first.operations.map(item => item.dependencies), [[], ['local-efficient-01-segment'], ['local-efficient-02-remove'], ['local-efficient-03-background-replace'], ['local-efficient-04-relight']]);
  assert.equal(first.candidates?.length, 2); assert.equal(first.selectedCandidateId, 'candidate-v1-local-efficient'); validateCreativePlan(first);
});

test('DAG validation rejects cycles, missing/self/duplicate dependencies, illegal artifacts and terminal writers', () => {
  const make = (operations: CreativePlan['operations']): CreativePlan => ({ requestId: 'x', status: 'READY', operations, provenance: { plannerVersion: 'x', decisionGoal: 'x', inputArtifacts: [{ id: 'input', kind: 'image' }], reasons: [] } });
  assert.throws(() => validateCreativePlan(make([{ id: 'a', type: 'x', dependencies: ['b'] }, { id: 'b', type: 'x', dependencies: ['a'] }])), /cycle/);
  assert.throws(() => validateCreativePlan(make([{ id: 'a', type: 'x', dependencies: ['missing'] }])), /missing dependency/);
  assert.throws(() => validateCreativePlan(make([{ id: 'a', type: 'x' }, { id: 'a', type: 'x' }])), /duplicate/);
  assert.throws(() => validateCreativePlan(make([{ id: 'a', type: 'x', dependencies: ['a'] }])), /self dependency/);
  assert.throws(() => validateCreativePlan(make([{ id: 'a', type: 'x', requiredArtifacts: ['forged'] }])), /illegal artifact/);
  assert.throws(() => validateCreativePlan(make([{ id: 'a', type: 'x', outputArtifacts: ['same'] }, { id: 'b', type: 'x', outputArtifacts: ['same'] }])), /conflicting terminal writer/);
});

test('constraints are immutable and filter cost, latency, quality, target, and LOCAL_ONLY cloud advice', async () => {
  const result = await plan({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT', planningConstraints: { preserveMode: 'STRICT', mustPreserve: ['identity'], mustChange: ['background'], forbiddenRegions: ['logo'], forbiddenTargets: ['HYBRID'], executionPolicy: 'LOCAL_ONLY', maxCredits: 2, maxLatencyMs: 1500, minimumQuality: .7 } });
  assert.equal(result.status, 'READY'); assert.equal(result.candidates?.find(item => item.targetPreference === 'CLOUD')?.status, 'REJECTED'); assert.ok(result.candidates?.find(item => item.targetPreference === 'CLOUD')?.reasonCodes.includes('EXECUTION_POLICY_LOCAL_ONLY')); assert.equal(result.candidates?.find(item => item.targetPreference === 'LOCAL')?.status, 'ACCEPTED'); assert.throws(() => (result.planningConstraints!.mustChange as string[]).push('x'), TypeError);
  const impossible = await plan({ operationIntent: 'COMPOSITE_REPLACE_RELIGHT', planningConstraints: { executionPolicy: 'LOCAL_ONLY', minimumQuality: .99, confirmationPolicy: 'BLOCK' } }); assert.equal(impossible.status, 'BLOCKED'); assert.equal(impossible.operations.length, 0); assert.throws(() => validateCreativePlan(impossible), /not executable/);
});

test('score ranking is deterministic with insertion-order-independent ID tie break', () => {
  const constraints = { preserveMode: 'STRICT', mustPreserve: [], mustChange: [], forbiddenTargets: [], forbiddenRegions: [], executionPolicy: 'AUTO', confirmationPolicy: 'ASK' } satisfies CreativePlanConstraints;
  const score = scoreCandidate(.8, 2, 1000, .9, .9); const item = (id: string): CreativePlanCandidate => ({ id, operations: [{ id: `op-${id}`, type: 'x' }], targetPreference: 'LOCAL', estimatedCredits: 2, estimatedLatencyMs: 1000, score, status: 'ACCEPTED', reasonCodes: [] });
  assert.deepEqual(rankAndFilter([item('b'), item('a')], constraints).map(x => x.id), ['a', 'b']); assert.deepEqual(rankAndFilter([item('a'), item('b')], constraints).map(x => x.id), ['a', 'b']); assert.deepEqual(score, { quality: .8, costEfficiency: .8, latency: .9, reliability: .9, confidence: .9, total: .85 });
});

test('uncertainty requires confirmation while unambiguous input remains READY', async () => {
  assert.deepEqual((await plan({ uncertainty: { intentInterpretation: .2 } })).confirmationReasons, ['LOW_INTENT_CONFIDENCE']);
  assert.deepEqual((await plan({ uncertainty: { targetResolution: .2 } })).confirmationReasons, ['AMBIGUOUS_TARGET']);
  assert.deepEqual((await plan({ uncertainty: { preservationRisk: .9 } })).confirmationReasons, ['HIGH_PRESERVATION_RISK']);
  assert.equal((await plan({ uncertainty: { intentInterpretation: .9, targetResolution: .9, feasibilityCapability: .9, preservationRisk: .1 } })).status, 'READY');
});

test('forged target/cost cannot bypass target/security or cause billing, and non-ready plans have zero side effects', async () => {
  for (const status of ['NEEDS_CONFIRMATION', 'BLOCKED'] as const) {
    const calls = { target: 0, security: 0, runtime: 0, reserve: 0 };
    const platform = new CreativeExecutionPlatform({ decision: { decide: async r => ({ requestId: r.id, goal: r.intent, constraints: [] }) }, planning: { plan: async r => ({ requestId: r.id, status, operations: [{ id: 'forged', type: 'x', providerId: 'cloud', cost: { credits: 999 } }] }) }, targetSelector: { select: () => { calls.target++; return 'CLOUD'; } }, securityGate: { authorize: () => { calls.security++; return false; } }, runtime: { execute: async () => { calls.runtime++; return {}; } }, providers: { isAvailable: () => true, fallback: () => undefined }, recovery: { decide: () => 'ABORT' }, billing: { reserve: async () => { calls.reserve++; }, commit: async () => {}, release: async () => {} } });
    platform.createExecution({ id: `forged-${status}`, intent: 'x', scope }); await assert.rejects(platform.execute(`forged-${status}`), /not executable/); assert.deepEqual(calls, { target: 0, security: 0, runtime: 0, reserve: 0 });
  }
});

test('planning architecture fitness forbids infrastructure and side-effect imports', async () => { for (const file of await collect('src/platform/creative/canonical/planning')) { const source = await readFile(file, 'utf8'); for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.doesNotMatch(match[1], /(server\/|\bpg\b|provider|transaction|billing|auth|artifact|http)/i); for (const marker of ['fetch(', 'localStorage', 'sessionStorage', 'document.cookie']) assert.equal(source.includes(marker), false); } });
test('provenance is secret-free and simple GLOBAL_EDIT / CONTROLLED_LOCAL_EDIT remain compatible', async () => { const global = await plan({ token: 'secret', cookie: 'secret', rawUrl: 'https://evil.test' }); assert.equal(global.operations[0].type, 'image-edit'); assert.doesNotMatch(JSON.stringify(global), /secret|evil\.test/); let controlledRequest = base({ editCapability: 'CONTROLLED_LOCAL_EDIT', selectedObjectIds: ['x'] }); controlledRequest = { ...controlledRequest, inputArtifacts: [...controlledRequest.inputArtifacts!, { id: 'mask', kind: 'mask', value: {}, producerOperationId: 'seed', scope, state: 'AVAILABLE', role: 'MASK' }] }; const controlled = await new CanonicalPlanningService().plan(controlledRequest, await new CanonicalDecisionService().decide(controlledRequest)); assert.equal(controlled.operations[0].type, 'CONTROLLED_LOCAL_EDIT'); });

async function collect(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map(entry => entry.isDirectory() ? collect(join(directory, entry.name)) : Promise.resolve(entry.name.endsWith('.ts') ? [join(directory, entry.name)] : [])))).flat(); }
