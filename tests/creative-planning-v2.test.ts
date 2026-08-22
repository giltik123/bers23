import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  CanonicalPlanningService,
  CreativeExecutionPlatform,
  rankCandidates,
  validatePlanIntegrity,
  type CreativeArtifact,
  type CreativePlan,
  type CreativePlanCandidate,
  type CreativeRequest,
  type CreativeExecutionPlatformDependencies,
} from '../src/platform/creative/canonical/index.ts';

const scope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const original = artifact('original', 'ORIGINAL');
const mask = artifact('mask', 'MASK');
const decision = (request: CreativeRequest) => ({ requestId: request.id, goal: request.intent, constraints: [] as string[] });

function artifact(id: string, role: CreativeArtifact['role']): CreativeArtifact {
  return { id, kind: 'image', value: { ignoredByPlanner: true }, producerOperationId: 'seed', scope, state: 'AVAILABLE', role, metadata: { sourceUrl: 'https://secret.example/asset' } };
}
function request(id: string, intent = 'edit image', metadata: Readonly<Record<string, unknown>> = {}, artifacts: readonly CreativeArtifact[] = [original]): CreativeRequest {
  return { id, intent, scope, inputArtifacts: artifacts, metadata };
}

test('6.40B preserves simple GLOBAL_EDIT and CONTROLLED_LOCAL_EDIT compatibility with deterministic immutable proposals', async () => {
  const planner = new CanonicalPlanningService();
  const global = request('global');
  const first = await planner.plan(global, decision(global));
  const second = await planner.plan(global, decision(global));
  assert.deepEqual(first, second);
  assert.equal(first.status, 'READY');
  assert.equal(first.operations[0].type, 'image-edit');
  assert.equal(first.operations[0].providerId, 'fal');
  assert.deepEqual(first.operations[0].requiredArtifacts, ['original']);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.candidates), true);
  assert.equal(Object.isFrozen(first.candidates?.[0].score), true);

  const controlled = request('controlled', 'remove the selected object', { editCapability: 'CONTROLLED_LOCAL_EDIT', selectedObjectIds: ['object-1'], preserveMode: 'STRICT', correlationId: 'corr-1' }, [original, mask]);
  const controlledPlan = await planner.plan(controlled, decision(controlled));
  assert.equal(controlledPlan.operations[0].type, 'CONTROLLED_LOCAL_EDIT');
  assert.deepEqual(controlledPlan.operations[0].requiredArtifacts, ['original', 'mask']);
  assert.deepEqual(controlledPlan.operations[0].input, { instruction: controlled.intent, preserveMode: 'STRICT', correlationId: 'corr-1' });
});

test('6.40B builds the deterministic five-step composite DAG and rejects malformed graphs fail closed', async () => {
  const planner = new CanonicalPlanningService();
  const composite = request('composite', 'remove the subject, replace background, then relight', { planningMode: 'COMPOSITE_EDIT' });
  const plan = await planner.plan(composite, decision(composite));
  assert.equal(plan.status, 'READY');
  assert.deepEqual(plan.operations.map(operation => operation.id), ['plan-segment', 'plan-remove', 'plan-background-replace', 'plan-relight', 'plan-verify']);
  assert.deepEqual(plan.operations.map(operation => operation.dependencies ?? []), [[], ['plan-segment'], ['plan-remove'], ['plan-background-replace'], ['plan-relight']]);
  assert.deepEqual(validatePlanIntegrity(plan, composite), []);

  const cycle: CreativePlan = { requestId: composite.id, status: 'READY', operations: [{ id: 'a', type: 'a', dependencies: ['b'] }, { id: 'b', type: 'b', dependencies: ['a'] }] };
  assert.equal(validatePlanIntegrity(cycle, composite).some(error => error.startsWith('cycle:')), true);
  const missing: CreativePlan = { requestId: composite.id, status: 'READY', operations: [{ id: 'a', type: 'a', dependencies: ['missing'] }] };
  assert.equal(validatePlanIntegrity(missing, composite).some(error => error.startsWith('missing-dependency:')), true);
  const duplicate: CreativePlan = { requestId: composite.id, status: 'READY', operations: [{ id: 'a', type: 'a' }, { id: 'a', type: 'b' }] };
  assert.equal(validatePlanIntegrity(duplicate, composite).some(error => error.startsWith('duplicate-operation:')), true);
  const illegalArtifact: CreativePlan = { requestId: composite.id, status: 'READY', operations: [{ id: 'a', type: 'a', requiredArtifacts: ['forged-artifact'] }] };
  assert.equal(validatePlanIntegrity(illegalArtifact, composite).some(error => error.startsWith('undeclared-artifact:')), true);
  const conflictingWriter: CreativePlan = { requestId: composite.id, status: 'READY', operations: [{ id: 'a', type: 'a', produces: ['same'] }, { id: 'b', type: 'b', produces: ['same'] }] };
  assert.equal(validatePlanIntegrity(conflictingWriter, composite).some(error => error.startsWith('conflicting-writer:')), true);
});

test('6.40B constraints filter candidates, LOCAL_ONLY is hard, and ranking tie-break is insertion-order independent', async () => {
  const planner = new CanonicalPlanningService();
  const localOnly = request('local-only', 'edit image', { planningConstraints: { executionPolicy: 'LOCAL_ONLY', mustPreserve: ['identity'], mustChange: ['background'], forbiddenRegions: ['face'] } });
  const localPlan = await planner.plan(localOnly, decision(localOnly));
  assert.equal(localPlan.planningConstraints?.executionPolicy, 'LOCAL_ONLY');
  assert.equal(localPlan.candidates?.find(candidate => candidate.id === 'cloud-quality')?.rejected, true);
  assert.equal(localPlan.selectedCandidateId, 'local-efficient');
  assert.equal(Object.isFrozen(localPlan.planningConstraints?.mustPreserve), true);

  const quality = request('quality', 'edit image', { planningConstraints: { minimumQuality: 0.9, maxCredits: 1, maxLatencyMs: 10_000 } });
  const qualityPlan = await planner.plan(quality, decision(quality));
  assert.equal(qualityPlan.selectedCandidateId, 'cloud-quality');
  assert.equal(qualityPlan.candidates?.find(candidate => candidate.id === 'local-efficient')?.rejectionReasons.includes('constraint:minimum-quality'), true);

  const impossible = request('impossible', 'edit image', { planningConstraints: { maxLatencyMs: 1 } });
  const blocked = await planner.plan(impossible, decision(impossible));
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.operations.length, 0);
  assert.deepEqual(blocked.confirmationReasons, ['constraints:no-feasible-candidate']);

  const seed = qualityPlan.candidates?.[0] as CreativePlanCandidate;
  const a: CreativePlanCandidate = { ...seed, id: 'a', rejected: false, rejectionReasons: [] };
  const b: CreativePlanCandidate = { ...seed, id: 'b', rejected: false, rejectionReasons: [] };
  assert.deepEqual(rankCandidates([b, a]).map(candidate => candidate.id), ['a', 'b']);
  assert.deepEqual(rankCandidates([a, b]).map(candidate => candidate.id), ['a', 'b']);
});

test('6.40B uncertainty requires confirmation for low intent, ambiguous target and preservation risk', async () => {
  const planner = new CanonicalPlanningService();
  const lowIntent = request('low-intent', 'edit image', { intentConfidence: 0.2 });
  assert.equal((await planner.plan(lowIntent, decision(lowIntent))).status, 'NEEDS_CONFIRMATION');
  const ambiguous = request('ambiguous', 'edit image', { targetAmbiguous: true });
  assert.equal((await planner.plan(ambiguous, decision(ambiguous))).confirmationReasons?.includes('uncertainty:target-resolution'), true);
  const risky = request('risky', 'edit image', { preservationRisk: 0.95 });
  assert.equal((await planner.plan(risky, decision(risky))).confirmationReasons?.includes('uncertainty:preservation-risk'), true);
  const permittedRisk = request('permitted-risk', 'edit image', { preservationRisk: 0.95, allowHighPreservationRisk: true });
  assert.equal((await planner.plan(permittedRisk, decision(permittedRisk))).status, 'READY');
  const confident = request('confident', 'edit image', { intentConfidence: 0.99, targetConfidence: 0.99, capabilityConfidence: 0.99, preservationRisk: 0.01 });
  assert.equal((await planner.plan(confident, decision(confident))).status, 'READY');
});

test('6.40B NEEDS_CONFIRMATION and BLOCKED plans stop before target selection, security and runtime', async () => {
  const calls = { target: 0, security: 0, runtime: 0 };
  const uncertain = request('guard-uncertain', 'edit image', { intentConfidence: 0.1 });
  const planner = new CanonicalPlanningService();
  const uncertainPlan = await planner.plan(uncertain, decision(uncertain));
  const deps = executionDependencies(uncertainPlan, calls, 'LOCAL', true);
  const platform = new CreativeExecutionPlatform(deps);
  platform.createExecution(uncertain);
  await assert.rejects(platform.compile(uncertain.id), /NEEDS_CONFIRMATION/);
  assert.deepEqual(calls, { target: 0, security: 0, runtime: 0 });

  const impossible = request('guard-blocked', 'edit image', { planningConstraints: { maxLatencyMs: 1 } });
  const blockedPlan = await planner.plan(impossible, decision(impossible));
  const blockedCalls = { target: 0, security: 0, runtime: 0 };
  const blockedPlatform = new CreativeExecutionPlatform(executionDependencies(blockedPlan, blockedCalls, 'LOCAL', true));
  blockedPlatform.createExecution(impossible);
  await assert.rejects(blockedPlatform.execute(impossible.id), /BLOCKED/);
  assert.deepEqual(blockedCalls, { target: 0, security: 0, runtime: 0 });
});

test('6.40B planner target preference cannot bypass downstream target/security and LOCAL_ONLY rejects cloud execution', async () => {
  const planner = new CanonicalPlanningService();
  const normal = request('security-revalidation');
  const plan = await planner.plan(normal, decision(normal));
  const calls = { target: 0, security: 0, runtime: 0 };
  const platform = new CreativeExecutionPlatform(executionDependencies(plan, calls, 'CLOUD', false));
  platform.createExecution(normal);
  await assert.rejects(platform.compile(normal.id), /Security or target policy blocked/);
  assert.equal(calls.target > 0, true);
  assert.equal(calls.security > 0, true);
  assert.equal(calls.runtime, 0);

  const localOnly = request('local-revalidation', 'edit image', { planningConstraints: { executionPolicy: 'LOCAL_ONLY' } });
  const localPlan = await planner.plan(localOnly, decision(localOnly));
  const localCalls = { target: 0, security: 0, runtime: 0 };
  const localPlatform = new CreativeExecutionPlatform(executionDependencies(localPlan, localCalls, 'CLOUD', true));
  localPlatform.createExecution(localOnly);
  await assert.rejects(localPlatform.compile(localOnly.id), /LOCAL_ONLY/);
  assert.equal(localCalls.target > 0, true);
  assert.equal(localCalls.security, 0);
  assert.equal(localCalls.runtime, 0);
});

test('6.40B provenance is secret-free and canonical artifact identity is the only artifact planning input', async () => {
  const planner = new CanonicalPlanningService();
  const secret = 'DO-NOT-LEAK-SECRET';
  const req = request('privacy', 'edit image', { bearer: secret, csrf: secret, providerSecret: secret, rawUrl: 'https://secret.example/private' });
  const plan = await planner.plan(req, decision(req));
  const serialized = JSON.stringify(plan);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('https://secret.example/private'), false);
  assert.deepEqual(plan.provenance?.inputArtifacts, [{ id: 'original', kind: 'image', role: 'ORIGINAL' }]);
  assert.deepEqual(plan.operations[0].requiredArtifacts, ['original']);
});

test('6.40B architecture fitness keeps planning pure and estimated candidate cost non-authoritative', async () => {
  const forbidden = ["from 'pg'", 'from "pg"', '/server/', '/transactions/', '/auth/', '/artifacts/', 'fetch(', 'axios', 'localStorage', 'sessionStorage'];
  for (const file of await collect('src/platform/creative/canonical/planning')) {
    const source = await readFile(file, 'utf8');
    for (const marker of forbidden) assert.equal(source.includes(marker), false, `${file} imports or invokes forbidden authority/transport marker ${marker}`);
  }
  const platform = await readFile('src/platform/creative/canonical/CreativeExecutionPlatform.ts', 'utf8');
  assert.equal(platform.includes('candidate.estimatedCredits'), false);
  assert.equal(platform.includes('assertExecutablePlan(plan, record.request)'), true);
  assert.equal(platform.indexOf('assertExecutablePlan(plan, record.request)') < platform.indexOf('targetSelector.select'), true);
});

function executionDependencies(plan: CreativePlan, calls: { target: number; security: number; runtime: number }, target: 'LOCAL' | 'CLOUD', authorized: boolean): CreativeExecutionPlatformDependencies {
  return {
    decision: { decide: async value => decision(value) },
    planning: { plan: async () => plan },
    targetSelector: { select: () => { calls.target++; return target; } },
    securityGate: { authorize: () => { calls.security++; return authorized; } },
    runtime: { execute: async () => { calls.runtime++; return { artifacts: [{ id: 'out', kind: 'image', value: {} }] }; } },
    providers: { isAvailable: () => true, fallback: () => undefined },
    verifier: { verify: async operation => ({ stepId: operation.id, valid: true, checks: [], errors: [] }) },
    recovery: { decide: () => 'ABORT' },
    now: () => 1,
  };
}

async function collect(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? collect(join(directory, entry.name)) : Promise.resolve(entry.name.endsWith('.ts') ? [join(directory, entry.name)] : [])))).flat();
}
