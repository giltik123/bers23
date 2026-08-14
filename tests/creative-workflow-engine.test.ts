import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { ArtifactRouter, CreativeWorkflowEngine, WorkflowCompiler, WorkflowOptimizer, deepFreeze, type Artifact, type Scope, type WorkflowOperation } from '../src/platform/creative/workflow-engine/index.ts';

const scope: Scope = { tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' };
const operations: WorkflowOperation[] = [
  { id: 'segment', type: 'sam', providerId: 'cloud-a', produces: ['mask'], cost: { credits: 2, aiCalls: 1 } },
  { id: 'paint', type: 'inpaint', dependencies: ['segment'], requiredArtifacts: ['mask-1'], providerId: 'cloud-a', produces: ['image'], cost: { credits: 3, aiCalls: 1 } },
  { id: 'encode', type: 'encode', dependencies: ['paint'], requiredArtifacts: ['image-1'], produces: ['encoded'] },
];
const compile = (ops = operations, budget = {}) => new WorkflowCompiler().compile({ id: 'wf-1', prompt: 'change the background', scope, sources: { creativePlan: { operations: ops }, providerSelection: { paint: 'cloud-a' } }, budget: { credits: 20, latencyMs: 1000, ramMb: 1000, gpuMs: 1000, aiCalls: 10, retries: 1, ...budget }, compiledAt: 7 });
const dependencies = (options: { unavailable?: string; fail?: string; invalid?: string; deny?: string } = {}) => ({
  now: (() => { let value = 100; return () => value++; })(),
  providers: { isAvailable: (id: string) => id !== options.unavailable, fallback: () => 'cloud-b' },
  policy: { allows: (operation: WorkflowOperation) => operation.id !== options.deny },
  runtime: { execute: async ({ operation }: { operation: WorkflowOperation }) => { if (operation.id === options.fail) throw new Error('runtime failed'); return { artifacts: (operation.produces ?? []).map((kind) => ({ id: `${kind}-1`, kind, value: { shared: true } })), latencyMs: 4, memoryMb: 12, gpuMs: 2 }; } },
  verifier: { verify: async (operation: WorkflowOperation, artifacts: readonly Artifact[]) => ({ stepId: operation.id, valid: operation.id !== options.invalid, checks: ['image-state', 'artifacts', 'resolution', 'alpha', 'metadata', 'pipeline-integrity'], errors: operation.id === options.invalid ? ['invalid output'] : artifacts.length || !(operation.produces?.length) ? [] : ['missing output'] }) },
});

const categories = ['compiler', 'optimizer', 'dependencies', 'executor', 'states', 'artifacts', 'monitor', 'recovery', 'verification', 'replay', 'explainability', 'snapshot', 'debugger', 'immutability', 'injection', 'isolation'] as const;
for (const category of categories) for (let variant = 1; variant <= 8; variant += 1) {
  test(`${category} deterministic case ${variant}`, async () => {
    if (category === 'compiler') { const workflow = compile(); assert.deepEqual(workflow.operations.map((item) => item.id), ['segment', 'paint', 'encode']); assert.equal(workflow.compiledAt, 7); }
    if (category === 'optimizer') { const base = compile([{ id: 'a', type: 'same', input: { n: variant } }, { id: 'b', type: 'same', input: { n: variant } }, { id: 'c', type: 'next', dependencies: ['b'] }]); const result = new WorkflowOptimizer().optimize(base); assert.deepEqual(result.operations.map((item) => item.id), ['a', 'c']); assert.deepEqual(result.operations[1].dependencies, ['a']); }
    if (category === 'dependencies') { const result = await new CreativeWorkflowEngine(dependencies()).execute(compile([{ id: 'a', type: 'x', requiredArtifacts: ['missing'] }])); assert.equal(result.status, 'FAILED'); assert.match(result.steps[0].error ?? '', /Artifact unavailable/); }
    if (category === 'executor') { const result = await new CreativeWorkflowEngine(dependencies()).execute(compile()); assert.equal(result.status, 'SUCCESS'); assert.equal(result.steps.length, 3); }
    if (category === 'states') { const result = await new CreativeWorkflowEngine(dependencies()).execute(compile()); const types = result.timeline.map((item) => item.type); for (const state of ['WAITING', 'READY', 'RUNNING', 'VERIFYING', 'SUCCESS', 'FINISHED']) assert.ok(types.includes(state)); }
    if (category === 'artifacts') { const router = new ArtifactRouter(); const artifact = router.put({ id: `a-${variant}`, kind: 'mask', value: { variant }, producerStepId: 'step', scope }); assert.equal(router.get(artifact.id, scope), artifact); assert.equal(router.route([artifact.id], scope)[0], artifact); }
    if (category === 'monitor') { const result = await new CreativeWorkflowEngine(dependencies()).execute(compile()); assert.equal(result.metrics.credits, 5); assert.equal(result.metrics.aiCalls, 2); assert.equal(result.metrics.providerUsage['cloud-a'], 2); }
    if (category === 'recovery') { const result = await new CreativeWorkflowEngine(dependencies({ unavailable: 'cloud-a' })).execute(compile()); assert.equal(result.status, 'SUCCESS'); assert.ok(result.timeline.some((item) => item.type === 'FALLBACK_PROVIDER')); assert.equal(result.health, 'degraded'); }
    if (category === 'verification') { const result = await new CreativeWorkflowEngine(dependencies({ invalid: 'segment' })).execute(compile(), []); assert.equal(result.status, 'FAILED'); assert.equal(result.verification[0].valid, false); }
    if (category === 'replay') { const engine = new CreativeWorkflowEngine(dependencies()); const result = await engine.execute(compile()); const replay = engine.replay(result); assert.deepEqual(replay, result); assert.equal(replay.replay.executableWithoutProviders, true); }
    if (category === 'explainability') { const engine = new CreativeWorkflowEngine(dependencies()); const result = await engine.execute(compile()); const explanation = engine.explain(result); assert.equal(explanation[0].decision, 'sam'); assert.match(explanation[0].reason, /verification/); }
    if (category === 'snapshot') { const engine = new CreativeWorkflowEngine(dependencies()); const result = await engine.execute(compile()); assert.equal(engine.snapshot('wf-1'), result); assert.equal(result.budget.credits, 20); assert.equal(result.health, 'healthy'); }
    if (category === 'debugger') { const engine = new CreativeWorkflowEngine(dependencies()); const result = await engine.execute(compile()); const debug = engine.debug(result); assert.equal(debug.result, 'SUCCESS'); assert.equal(debug.compiledWorkflow.id, 'wf-1'); assert.equal(debug.artifacts.length, 3); }
    if (category === 'immutability') { const result = deepFreeze({ nested: { values: [variant] } }); assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.nested), true); assert.equal(Object.isFrozen(result.nested.values), true); }
    if (category === 'injection') { let calls = 0; const deps = dependencies(); const original = deps.runtime.execute; deps.runtime.execute = async (request) => { calls += 1; return original(request); }; await new CreativeWorkflowEngine(deps).execute(compile()); assert.equal(calls, 3); }
    if (category === 'isolation') { const router = new ArtifactRouter(); router.put({ id: 'same', kind: 'mask', value: variant, producerStepId: 'a', scope }); const other = { ...scope, userId: `other-${variant}` }; assert.equal(router.get('same', other), undefined); assert.equal(router.list(other).length, 0); }
  });
}

test('compiler rejects cycles, unknown dependencies and incomplete scope', () => {
  assert.throws(() => compile([{ id: 'a', type: 'x', dependencies: ['b'] }, { id: 'b', type: 'x', dependencies: ['a'] }]), /cycle/);
  assert.throws(() => compile([{ id: 'a', type: 'x', dependencies: ['missing'] }]), /Unknown dependency/);
  assert.throws(() => new WorkflowCompiler().compile({ id: 'x', prompt: '', scope: { ...scope, tenantId: '' }, sources: {} }), /required/);
});
test('budget, policy and provider failures fail closed', async () => {
  assert.match((await new CreativeWorkflowEngine(dependencies()).execute(compile(operations, { credits: 1 }))).steps[0].error ?? '', /budget/);
  assert.match((await new CreativeWorkflowEngine(dependencies({ deny: 'segment' })).execute(compile())).steps[0].error ?? '', /denied/);
  const deps = dependencies({ unavailable: 'cloud-a' }); deps.providers.fallback = () => undefined; assert.match((await new CreativeWorkflowEngine(deps).execute(compile())).steps[0].error ?? '', /Provider unavailable/);
});
test('seed artifacts cannot cross tenant/project/user boundary', async () => {
  const foreign = { id: 'mask-1', kind: 'mask', value: {}, producerStepId: 'foreign', scope: { ...scope, tenantId: 'foreign' } };
  await assert.rejects(() => new CreativeWorkflowEngine(dependencies()).execute(compile(), [foreign]), /isolation/);
});
test('workflow layer has no forbidden infrastructure imports', async () => {
  for (const file of await collect('src/platform/creative/workflow-engine')) { const source = await readFile(file, 'utf8'); for (const marker of ['fal.ai', "from 'reve", 'react', 'billing', 'database', 'node:fs', 'node:http', 'fetch(', 'axios']) assert.equal(source.toLowerCase().includes(marker.toLowerCase()), false, `${file} contains ${marker}`); }
});
async function collect(directory: string): Promise<string[]> { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? collect(join(directory, entry.name)) : Promise.resolve(entry.name.endsWith('.ts') ? [join(directory, entry.name)] : [])))).flat(); }
