import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  ARTIFACT_LIFECYCLE,
  CANONICAL_PLANNER_VERSION,
  CREATIVE_OPERATION_STATES,
  CanonicalDecisionService,
  CanonicalPlanningService,
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type CreativeRequest,
} from '../src/platform/creative/canonical/index.ts';
import { ProductionExecutionCapabilityRegistry } from '../server/core/providers/productionExecutionCapabilities.ts';

const scope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const request: CreativeRequest = { id: 'execution-1', intent: 'prepare image', scope, budget: { credits: 10, aiCalls: 3, latencyMs: 100, ramMb: 100, gpuMs: 100, retries: 0 } };
const events: string[] = [];
const dependencies = (): CreativeExecutionPlatformRuntimeDependencies => ({
  decision: { decide: async value => { events.push('decision'); return { requestId: value.id, goal: value.intent, constraints: [] }; } },
  planning: { plan: async (value, decision) => { events.push('planning'); return { requestId: value.id, operations: [{ id: 'normalize', type: decision.goal, produces: ['image'], providerId: 'forged-planner-provider' }] }; } },
  routeSelector: { select: () => 'PROVIDER' }, targetSelector: { select: () => { events.push('target'); return 'LOCAL'; } },
  providerSelector: { select: () => { events.push('provider'); return { allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'synthetic-local', selectionId: 'synthetic-local:normalize' }; } },
  capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'synthetic-canonical-test-runtime' }) },
  securityGate: { authorize: (_request, operation) => { events.push('security'); assert.equal(operation.providerId, 'synthetic-local'); return true; } },
  runtime: { execute: async ({ operation }) => { events.push('runtime'); assert.equal(operation.providerId, 'synthetic-local'); return { artifacts: [{ id: 'image-1', kind: 'image', value: { pixels: true } }], latencyMs: 1, memoryMb: 1, gpuMs: 0 }; } },
  providers: { isAvailable: () => true, fallback: () => undefined },
  verifier: { verify: async operation => { events.push('verification'); return { stepId: operation.id, valid: true, checks: ['expected-vs-actual'], errors: [] }; } },
  recovery: { decide: () => 'ABORT' },
  telemetry: { record: () => { events.push('telemetry'); } },
  now: () => 1,
});

test('full vertical contract uses the canonical execution path', async () => { events.length = 0; const platform = new CreativeExecutionPlatform(dependencies()); platform.createExecution(request); await platform.plan(request.id); const compiled = await platform.compile(request.id); assert.equal(compiled.operations[0].providerId, 'synthetic-local'); const outcome = await platform.execute(request.id); assert.equal(outcome.status, 'SUCCESS'); assert.equal(outcome.artifacts[0].state, 'FINAL'); assert.deepEqual(events, ['decision', 'planning', 'target', 'provider', 'security', 'runtime', 'verification', 'telemetry']); assert.equal(platform.verify(request.id).valid, true); assert.deepEqual(platform.replay(request.id), platform.snapshot(request.id)); });
test('planner verification claims cannot override authoritative runtime verification failure', async () => { const deps = dependencies(); deps.planning.plan = async value => ({ requestId: value.id, operations: [{ id: 'normalize', type: 'edit', produces: ['image'], verificationPassed: true } as never] }); deps.verifier = { verify: async operation => ({ stepId: operation.id, valid: false, checks: [], errors: ['canonical verifier rejected output'] }) }; const platform = new CreativeExecutionPlatform(deps); platform.createExecution(request); const outcome = await platform.execute(request.id); assert.equal(outcome.status, 'FAILED'); assert.equal(outcome.verification.valid, false); });
test('target selection and security gate cannot be bypassed', async () => { let runtimeCalls = 0; const deps = dependencies(); deps.targetSelector.select = () => 'CLOUD'; deps.securityGate.authorize = () => false; deps.runtime.execute = async () => { runtimeCalls++; return {}; }; const platform = new CreativeExecutionPlatform(deps); platform.createExecution(request); await assert.rejects(platform.compile(request.id), /blocked/); assert.equal(runtimeCalls, 0); });
test('blocked targets fail closed before provider selection or runtime execution', async () => { let providerSelections = 0; const deps = dependencies(); deps.targetSelector.select = () => 'BLOCKED'; deps.providerSelector.select = () => { providerSelections++; return { allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'should-not-run', selectionId: 'should-not-run' }; }; const platform = new CreativeExecutionPlatform(deps); platform.createExecution(request); await assert.rejects(platform.execute(request.id), /blocked/); assert.equal(providerSelections, 0); });
test('production capability admission blocks unsupported operations before security, billing and runtime', async () => {
  const calls = { security: 0, reserve: 0, runtime: 0 };
  const platform = new CreativeExecutionPlatform({
    decision: { decide: async value => ({ requestId: value.id, goal: value.intent, constraints: [] }) },
    planning: { plan: async value => ({ requestId: value.id, status: 'READY', operations: [{ id: 'unsupported-step', type: 'unknown-operation', providerId: 'planner-evil' }] }) },
    routeSelector: { select: () => 'PROVIDER' }, targetSelector: { select: () => 'CLOUD' },
    providerSelector: { select: () => ({ allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'synthetic-capability:fal' }) },
    capabilityAdmission: new ProductionExecutionCapabilityRegistry(),
    securityGate: { authorize: () => { calls.security++; return true; } },
    runtime: { execute: async () => { calls.runtime++; return {}; } },
    providers: { isAvailable: () => true, fallback: () => undefined },
    recovery: { decide: () => 'ABORT' },
    billing: { reserve: async () => { calls.reserve++; }, commit: async () => {}, release: async () => {} },
  });
  const unsupported = { ...request, id: 'unsupported-capability' };
  platform.createExecution(unsupported);
  await assert.rejects(platform.compile(unsupported.id), /Execution capability blocked operation unsupported-step: UNSUPPORTED_OPERATION/);
  assert.deepEqual(calls, { security: 0, reserve: 0, runtime: 0 });
});
test('pause, resume and cancel are controlled by the facade', async () => { const platform = new CreativeExecutionPlatform(dependencies()); platform.createExecution(request); platform.pause(request.id); assert.equal(platform.status(request.id), 'WAITING'); await assert.rejects(platform.execute(request.id), /paused/); platform.resume(request.id); assert.equal((await platform.execute(request.id)).status, 'SUCCESS'); });
test('canonical authorities expose one state and artifact lifecycle', () => { assert.deepEqual(CREATIVE_OPERATION_STATES, ['WAITING', 'READY', 'RUNNING', 'VERIFYING', 'SUCCESS', 'FAILED', 'RECOVERING', 'SKIPPED', 'UNKNOWN']); assert.deepEqual(ARTIFACT_LIFECYCLE, ['CREATED', 'VALIDATED', 'AVAILABLE', 'CONSUMED', 'SUPERSEDED', 'FINAL', 'FAILED', 'QUARANTINED']); });

test('6.40A canonical planning preserves global-edit production behavior', async () => {
  const decision = await new CanonicalDecisionService().decide(request);
  const plan = await new CanonicalPlanningService().plan(request, decision);
  assert.equal(plan.requestId, request.id);
  assert.equal(plan.plannerVersion, CANONICAL_PLANNER_VERSION);
  assert.equal(plan.goal, request.intent);
  const [{ verification, ...operation }] = plan.operations;
  assert.deepEqual([operation], [{
    id: 'creative-image-edit', type: 'image-edit', providerId: 'fal', requiredArtifacts: [], produces: ['image'],
    input: { prompt: request.intent, correlationId: undefined },
  }]);
  assert.equal(verification?.[0].required, true);
  assert.equal(plan.provenance?.plannerVersion, CANONICAL_PLANNER_VERSION);
});

test('6.40A controlled edit requires canonical ORIGINAL, MASK and selected objects', async () => {
  const original = artifact('original', 'ORIGINAL');
  const mask = artifact('mask', 'MASK');
  const controlledRequest: CreativeRequest = {
    id: 'controlled-1', intent: 'replace selected object', scope, inputArtifacts: [original, mask],
    metadata: { editCapability: 'CONTROLLED_LOCAL_EDIT', selectedObjectIds: ['object-1'], preserveMode: 'BALANCED', correlationId: 'corr-1', inputArtifact: 'https://untrusted.example/raw.png' },
  };
  const decision = await new CanonicalDecisionService().decide(controlledRequest);
  const planner = new CanonicalPlanningService();
  const plan = await planner.plan(controlledRequest, decision);
  const { verification, ...operation } = plan.operations[0];
  assert.deepEqual(operation, {
    id: 'creative-image-edit', type: 'CONTROLLED_LOCAL_EDIT', providerId: 'fal', requiredArtifacts: ['original', 'mask'], produces: ['image'],
    input: { instruction: controlledRequest.intent, preserveMode: 'BALANCED', correlationId: 'corr-1' },
  });
  assert.equal(verification?.[0].required, true);
  assert.deepEqual(plan.provenance?.inputArtifacts, [
    { id: 'original', kind: 'image', role: 'ORIGINAL' },
    { id: 'mask', kind: 'image', role: 'MASK' },
  ]);
  assert.equal(JSON.stringify(plan).includes('untrusted.example'), false, 'raw URL metadata must not become planning authority/provenance');

  for (const missing of [
    { ...controlledRequest, id: 'missing-mask', inputArtifacts: [original] },
    { ...controlledRequest, id: 'missing-original', inputArtifacts: [mask] },
    { ...controlledRequest, id: 'missing-selection', metadata: { ...controlledRequest.metadata, selectedObjectIds: [] } },
  ]) {
    const fallbackDecision = await new CanonicalDecisionService().decide(missing);
    const fallback = await planner.plan(missing, fallbackDecision);
    assert.equal(fallback.operations[0].type, 'image-edit');
  }
});

test('6.40A planning is deterministic and deeply immutable at the proposal boundary', async () => {
  const original = artifact('original', 'ORIGINAL');
  const planRequest: CreativeRequest = { id: 'deterministic-1', intent: 'edit image', scope, inputArtifacts: [original], metadata: { correlationId: 'corr' } };
  const decision = await new CanonicalDecisionService().decide(planRequest);
  const planner = new CanonicalPlanningService({ plannerVersion: 'test-version' });
  const first = await planner.plan(planRequest, decision);
  const second = await planner.plan(planRequest, decision);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.operations), true);
  assert.equal(Object.isFrozen(first.operations[0]), true);
  assert.equal(Object.isFrozen(first.operations[0].input), true);
  assert.equal(Object.isFrozen(first.provenance), true);
  assert.equal(Object.isFrozen(first.provenance?.inputArtifacts), true);
  assert.throws(() => (first.operations as unknown as unknown[]).push({}), TypeError);
  assert.throws(() => ((first.operations[0].input as Record<string, unknown>).prompt = 'mutated'), TypeError);
  assert.deepEqual(second.operations[0].input, { prompt: 'edit image', correlationId: 'corr' });
});

test('architecture fitness: canonical layers have no forbidden reverse or transport dependencies', async () => {
  const rules: readonly [string, readonly string[]][] = [
    ['src/platform/creative/canonical', ['fetch(', 'axios', '/providers/', "from '../providers", "from '../decision", 'react']],
    ['src/platform/creative/pipeline', ['fetch(', 'axios', '/providers/', "from '../providers", "from '../decision"]],
    ['src/platform/creative/providers', ["from '../planning", "from '../../planning"]],
    ['src/platform/creative/runtime', ["from '../decision"]],
    ['src/platform/creative/provider-runtime', ['/providers/fal', "from '../providers/fal", '/billing/', '/ui/', '/workflow-engine/']],
    ['src/platform/creative/execution', ['/providers/fal', "from '../providers/fal"]],
    ['src/platform/creative/decision', ['/providers/', "from '../providers", '/provider-runtime/']],
  ];
  for (const [directory, forbidden] of rules) for (const file of await collect(directory)) { const source = await readFile(file, 'utf8'); for (const marker of forbidden) assert.equal(source.includes(marker), false, `${file} bypasses canonical direction with ${marker}`); }
  const contracts = await readFile('src/platform/creative/canonical/contracts.ts', 'utf8'); assert.equal((contracts.match(/CREATIVE_OPERATION_STATES\s*=/g) ?? []).length, 1); assert.equal((contracts.match(/interface CreativeArtifact\s/g) ?? []).length, 1);
  const facade = await readFile('src/platform/creative/canonical/CreativeExecutionPlatform.ts', 'utf8'); assert.equal((facade.match(/new CreativeWorkflowEngine/g) ?? []).length, 1);
  const creativeFiles = await collect('src/platform/creative'); const concreteImports: string[] = [];
  for (const file of creativeFiles) if ((await readFile(file, 'utf8')).match(/from ['"][^'"]*providers\/fal/)) concreteImports.push(file);
  assert.deepEqual(concreteImports, ['src/platform/creative/composition/CreativeProviderComposition.ts']);
});

test('6.40A architecture fitness: canonical planning is pure advisory code and production has one named path', async () => {
  const planningFiles = await collect('src/platform/creative/canonical/planning');
  const forbiddenImport = /(server\/|\bpg\b|providers\/fal|transactions|billing|auth|artifactAuthority|signedArtifact|nodeHttp|http\/)/i;
  for (const file of planningFiles) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.equal(forbiddenImport.test(match[1]), false, `${file} imports forbidden authority/infrastructure ${match[1]}`);
    for (const marker of ['fetch(', 'localStorage', 'sessionStorage', 'document.cookie']) assert.equal(source.includes(marker), false, `${file} contains forbidden side-effect surface ${marker}`);
  }
  assert.deepEqual(Object.getOwnPropertyNames(CanonicalPlanningService.prototype).sort(), ['constructor', 'plan']);
  assert.deepEqual(Object.getOwnPropertyNames(CanonicalDecisionService.prototype).sort(), ['constructor', 'decide']);
  const production = await readFile('server/core/composition/createProductionCore.ts', 'utf8');
  assert.equal(production.includes('new CanonicalDecisionService()'), true);
  assert.equal(production.includes('new CanonicalPlanningService()'), true);
  assert.equal(/decision:\s*\{\s*decide:/.test(production), false, 'production composition must not embed an inline decision algorithm');
  assert.equal(/planning:\s*\{\s*plan:/.test(production), false, 'production composition must not embed an inline planning algorithm');
});

test('architecture fitness: legacy workflow analysis is advisory and cannot become an execution authority', async () => {
  const legacyIndex = await readFile('src/platform/workflow/intelligence/index.ts', 'utf8');
  assert.equal(legacyIndex.includes('./WorkflowIntelligence'), false);
  for (const file of await collect('src/platform/workflow/intelligence')) {
    const source = await readFile(file, 'utf8');
    assert.equal(/\bexecute\s*\(/.test(source), false, `${file} exposes execution authority`);
  }
  const canonicalFacade = await readFile('src/platform/creative/canonical/CreativeExecutionPlatform.ts', 'utf8');
  assert.equal((canonicalFacade.match(/new CreativeWorkflowEngine/g) ?? []).length, 1);
});

function artifact(id: string, role: CreativeArtifact['role']): CreativeArtifact {
  return Object.freeze({ id, kind: 'image', value: Object.freeze({ artifactId: id }), producerOperationId: 'seed', scope, state: 'AVAILABLE', role });
}

async function collect(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map(entry => entry.isDirectory() ? collect(join(directory, entry.name)) : Promise.resolve(entry.name.endsWith('.ts') ? [join(directory, entry.name)] : [])))).flat(); }
