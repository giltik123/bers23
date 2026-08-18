import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { ARTIFACT_LIFECYCLE, CREATIVE_OPERATION_STATES, CreativeExecutionPlatform, type CreativeExecutionPlatformDependencies, type CreativeRequest } from '../src/platform/creative/canonical/index.ts';

const scope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const request: CreativeRequest = { id: 'execution-1', intent: 'prepare image', scope, budget: { credits: 10, aiCalls: 3, latencyMs: 100, ramMb: 100, gpuMs: 100, retries: 0 } };
const events: string[] = [];
const dependencies = (): CreativeExecutionPlatformDependencies => ({
  decision: { decide: async value => { events.push('decision'); return { requestId: value.id, goal: value.intent, constraints: [] }; } },
  planning: { plan: async (value, decision) => { events.push('planning'); return { requestId: value.id, operations: [{ id: 'normalize', type: decision.goal, produces: ['image'] }] }; } },
  targetSelector: { select: () => { events.push('target'); return 'LOCAL'; } },
  securityGate: { authorize: () => { events.push('security'); return true; } },
  runtime: { execute: async ({ operation }) => { events.push('runtime'); return { artifacts: [{ id: 'image-1', kind: 'image', value: { pixels: true } }], latencyMs: 1, memoryMb: 1, gpuMs: 0 }; } },
  providers: { isAvailable: () => true, fallback: () => undefined },
  verifier: { verify: async operation => { events.push('verification'); return { stepId: operation.id, valid: true, checks: ['expected-vs-actual'], errors: [] }; } },
  recovery: { decide: () => 'ABORT' },
  telemetry: { record: () => { events.push('telemetry'); } },
  now: () => 1,
});

test('full vertical contract uses the canonical execution path', async () => { events.length = 0; const platform = new CreativeExecutionPlatform(dependencies()); platform.createExecution(request); await platform.plan(request.id); await platform.compile(request.id); const outcome = await platform.execute(request.id); assert.equal(outcome.status, 'SUCCESS'); assert.equal(outcome.artifacts[0].state, 'FINAL'); assert.deepEqual(events, ['decision', 'planning', 'target', 'security', 'runtime', 'verification', 'telemetry']); assert.equal(platform.verify(request.id).valid, true); assert.deepEqual(platform.replay(request.id), platform.snapshot(request.id)); });
test('target selection and security gate cannot be bypassed', async () => { let runtimeCalls = 0; const deps = dependencies(); deps.targetSelector.select = () => 'CLOUD'; deps.securityGate.authorize = () => false; deps.runtime.execute = async () => { runtimeCalls++; return {}; }; const platform = new CreativeExecutionPlatform(deps); platform.createExecution(request); await assert.rejects(platform.compile(request.id), /blocked/); assert.equal(runtimeCalls, 0); });
test('blocked targets fail closed before runtime execution', async () => { const deps = dependencies(); deps.targetSelector.select = () => 'BLOCKED'; const platform = new CreativeExecutionPlatform(deps); platform.createExecution(request); await assert.rejects(platform.execute(request.id), /blocked/); });
test('pause, resume and cancel are controlled by the facade', async () => { const platform = new CreativeExecutionPlatform(dependencies()); platform.createExecution(request); platform.pause(request.id); assert.equal(platform.status(request.id), 'WAITING'); await assert.rejects(platform.execute(request.id), /paused/); platform.resume(request.id); assert.equal((await platform.execute(request.id)).status, 'SUCCESS'); });
test('canonical authorities expose one state and artifact lifecycle', () => { assert.deepEqual(CREATIVE_OPERATION_STATES, ['WAITING', 'READY', 'RUNNING', 'VERIFYING', 'SUCCESS', 'FAILED', 'RECOVERING', 'SKIPPED', 'UNKNOWN']); assert.deepEqual(ARTIFACT_LIFECYCLE, ['CREATED', 'VALIDATED', 'AVAILABLE', 'CONSUMED', 'SUPERSEDED', 'FINAL', 'FAILED', 'QUARANTINED']); });

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

async function collect(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map(entry => entry.isDirectory() ? collect(join(directory, entry.name)) : Promise.resolve(entry.name.endsWith('.ts') ? [join(directory, entry.name)] : [])))).flat(); }
