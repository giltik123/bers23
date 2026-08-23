import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ArtifactRouter,
  CreativeWorkflowEngine,
  WorkflowCompiler,
  canonicalIntermediateArtifactId,
  type Artifact,
  type Scope,
  type WorkflowOperation,
} from '../src/platform/creative/workflow-engine/index.ts';

const scope: Scope = Object.freeze({ tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' });
const budget = Object.freeze({ credits: 20, latencyMs: 1000, ramMb: 1000, gpuMs: 1000, aiCalls: 10, retries: 0 });
const seed: Artifact = Object.freeze({ id: 'seed-original', kind: 'image', value: { seed: true }, producerStepId: 'user-input', scope });

const boundOperations: readonly WorkflowOperation[] = Object.freeze([
  Object.freeze({ id: 'segment', type: 'segment', requiredArtifacts: ['seed-original'], produces: ['mask'], outputArtifacts: ['logical-mask'] }),
  Object.freeze({ id: 'paint', type: 'paint', dependencies: ['segment'], requiredArtifacts: ['logical-mask'], produces: ['image'], outputArtifacts: ['logical-image'] }),
]);

function compile(operations: readonly WorkflowOperation[] = boundOperations) {
  return new WorkflowCompiler().compile({ id: 'workflow-1', prompt: 'edit', scope, sources: { creativePlan: { operations } }, budget, compiledAt: 7 });
}

function engineWith(runtime: (operation: WorkflowOperation, artifacts: readonly Artifact[]) => Promise<Readonly<{ artifacts?: readonly any[] }>>) {
  return new CreativeWorkflowEngine({
    providers: { isAvailable: () => true, fallback: () => undefined },
    runtime: { execute: async ({ operation, artifacts }) => runtime(operation, artifacts) },
    verifier: { verify: async (operation, artifacts) => ({ stepId: operation.id, valid: artifacts.length === (operation.produces?.length ?? 0), checks: ['bound-output-contract'], errors: [] }) },
    now: (() => { let value = 1; return () => value++; })(),
  });
}

test('compiler deterministically binds logical outputs and rewrites downstream inputs', () => {
  const first = compile();
  const second = compile();
  assert.deepEqual(first, second);
  const segment = first.operations[0];
  const paint = first.operations[1];
  const expectedMaskId = canonicalIntermediateArtifactId('workflow-1', 'segment', 0, 'logical-mask');
  const expectedImageId = canonicalIntermediateArtifactId('workflow-1', 'paint', 0, 'logical-image');
  assert.deepEqual(segment.outputBindings, [{ logicalId: 'logical-mask', artifactId: expectedMaskId, kind: 'mask', slot: 0 }]);
  assert.deepEqual(paint.outputBindings, [{ logicalId: 'logical-image', artifactId: expectedImageId, kind: 'image', slot: 0 }]);
  assert.deepEqual(paint.requiredArtifacts, [expectedMaskId]);
  assert.notEqual(expectedMaskId, 'logical-mask');
});

test('runtime identity and lineage claims are non-authoritative for declared outputs', async () => {
  const workflow = compile();
  const maskId = workflow.operations[0].outputBindings![0].artifactId;
  const imageId = workflow.operations[1].outputBindings![0].artifactId;
  const seenInputs: string[][] = [];
  const engine = engineWith(async (operation, artifacts) => {
    seenInputs.push(artifacts.map(artifact => artifact.id));
    if (operation.id === 'segment') return { artifacts: [{
      id: 'provider-forged-mask-id', kind: 'mask', value: { mask: true },
      scope: { tenantId: 'evil', projectId: 'evil', userId: 'evil' }, producerStepId: 'evil-producer',
      metadata: { parentArtifactIds: ['evil-parent'], consumerOperationIds: ['evil-consumer'], canonicalArtifactId: 'evil-canonical', workflowId: 'evil-workflow', producerOperationId: 'evil-producer', lifecycle: 'FINAL', artifactRole: 'COMPOSITE', logicalOutputId: 'evil-logical', outputSlot: 99, providerSafe: 'kept' },
    }] };
    return { artifacts: [{
      id: 'provider-forged-image-id', kind: 'image', value: { image: true },
      metadata: { parentArtifactIds: ['evil-parent-2'], consumerOperationIds: ['evil'], providerSafe: 'kept-2' },
    }] };
  });
  const result = await engine.execute(workflow, [seed]);
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(seenInputs, [['seed-original'], [maskId]]);
  assert.equal(result.artifacts.some(artifact => artifact.id === 'provider-forged-mask-id' || artifact.id === 'provider-forged-image-id'), false);

  const mask = result.artifacts.find(artifact => artifact.id === maskId)!;
  assert.equal(mask.producerStepId, 'segment');
  assert.deepEqual(mask.scope, scope);
  assert.deepEqual(mask.metadata?.parentArtifactIds, ['seed-original']);
  assert.deepEqual(mask.metadata?.consumerOperationIds, ['paint']);
  assert.equal(mask.metadata?.workflowId, 'workflow-1');
  assert.equal(mask.metadata?.canonicalArtifactId, maskId);
  assert.equal(mask.metadata?.producerOperationId, 'segment');
  assert.equal(mask.metadata?.logicalOutputId, 'logical-mask');
  assert.equal(mask.metadata?.outputSlot, 0);
  assert.equal(mask.metadata?.lifecycle, 'AVAILABLE');
  assert.equal(mask.metadata?.artifactRole, 'WORKING');
  assert.equal(mask.metadata?.providerSafe, 'kept');

  const image = result.artifacts.find(artifact => artifact.id === imageId)!;
  assert.equal(image.producerStepId, 'paint');
  assert.deepEqual(image.metadata?.parentArtifactIds, [maskId]);
  assert.deepEqual(image.metadata?.consumerOperationIds, []);
  assert.equal(image.metadata?.logicalOutputId, 'logical-image');
  assert.equal(image.metadata?.providerSafe, 'kept-2');
});

test('declared output contract fails closed on missing, wrong-kind and extra runtime outputs', async (t) => {
  const operation: WorkflowOperation = { id: 'bound', type: 'bound', produces: ['image'], outputArtifacts: ['logical-image'] };
  const cases = [
    { name: 'missing', artifacts: [], error: /output count/ },
    { name: 'wrong kind', artifacts: [{ id: 'provider', kind: 'mask', value: {} }], error: /output kind/ },
    { name: 'extra', artifacts: [{ id: 'provider-a', kind: 'image', value: {} }, { id: 'provider-b', kind: 'image', value: {} }], error: /output count/ },
  ];
  for (const entry of cases) await t.test(entry.name, async () => {
    const result = await engineWith(async () => ({ artifacts: entry.artifacts })).execute(compile([operation]));
    assert.equal(result.status, 'FAILED');
    assert.match(result.steps[0].error ?? '', entry.error);
  });
});

test('failed verification does not publish bound identity into ArtifactRouter before retry', async () => {
  let attempt = 0;
  const workflow = new WorkflowCompiler().compile({
    id: 'retry-workflow', prompt: 'retry', scope,
    sources: { creativePlan: { operations: [{ id: 'bound', type: 'bound', produces: ['image'], outputArtifacts: ['logical-image'] }] } },
    budget: { ...budget, retries: 1 }, compiledAt: 1,
  });
  const engine = new CreativeWorkflowEngine({
    providers: { isAvailable: () => true, fallback: () => undefined },
    runtime: { execute: async () => ({ artifacts: [{ id: `provider-${++attempt}`, kind: 'image', value: { attempt } }] }) },
    verifier: { verify: async (operation) => ({ stepId: operation.id, valid: attempt === 2, checks: ['retry'], errors: attempt === 1 ? ['first rejected'] : [] }) },
    now: (() => { let value = 1; return () => value++; })(),
  });
  const result = await engine.execute(workflow);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(attempt, 2);
  const canonicalId = workflow.operations[0].outputBindings![0].artifactId;
  assert.equal(result.artifacts.filter(artifact => artifact.id === canonicalId).length, 1);
  assert.deepEqual(result.artifacts.find(artifact => artifact.id === canonicalId)?.value, { attempt: 2 });
});

test('compiler rejects duplicate/mismatched output declarations and undeclared dependency edges', () => {
  assert.throws(() => compile([
    { id: 'a', type: 'a', produces: ['image'], outputArtifacts: ['same-output'] },
    { id: 'b', type: 'b', produces: ['image'], outputArtifacts: ['same-output'] },
  ]), /Duplicate logical output artifact/);
  assert.throws(() => compile([{ id: 'a', type: 'a', produces: ['image', 'mask'], outputArtifacts: ['only-one'] }]), /output contract mismatch/);
  assert.throws(() => compile([
    { id: 'a', type: 'a', produces: ['image'], outputArtifacts: ['a-output'] },
    { id: 'b', type: 'b', requiredArtifacts: ['a-output'], produces: ['image'], outputArtifacts: ['b-output'] },
  ]), /Illegal intermediate artifact dependency/);
});

test('seed artifacts cannot impersonate logical or canonical intermediate outputs', async () => {
  const workflow = compile([{ id: 'a', type: 'a', produces: ['image'], outputArtifacts: ['seed-original'] }]);
  await assert.rejects(() => engineWith(async () => ({ artifacts: [{ id: 'provider', kind: 'image', value: {} }] })).execute(workflow, [seed]), /collides with declared intermediate output/);

  const normal = compile([{ id: 'a', type: 'a', produces: ['image'], outputArtifacts: ['logical-a'] }]);
  const canonical = normal.operations[0].outputBindings![0].artifactId;
  const forgedSeed = { ...seed, id: canonical };
  await assert.rejects(() => engineWith(async () => ({ artifacts: [{ id: 'provider', kind: 'image', value: {} }] })).execute(normal, [forgedSeed]), /collides with declared intermediate output/);
});

test('ArtifactRouter remains immutable and scope-isolated for bound identities', () => {
  const router = new ArtifactRouter();
  const id = canonicalIntermediateArtifactId('workflow-1', 'segment', 0, 'logical-mask');
  router.put({ id, kind: 'mask', value: {}, producerStepId: 'segment', scope });
  assert.throws(() => router.put({ id, kind: 'mask', value: {}, producerStepId: 'evil', scope }), /immutable/);
  assert.equal(router.get(id, { ...scope, userId: 'other' }), undefined);
});

test('intermediate binding layer has no authority or provider transport imports', async () => {
  const source = await readFile('src/platform/creative/workflow-engine/IntermediateArtifactBinding.ts', 'utf8');
  for (const marker of ['/auth/', '/projects/', '/artifacts/', '/transactions/', '/billing/', 'fal.ai', 'fetch(', 'axios', "from 'pg'", 'Postgres', 'TransactionService', 'ArtifactAuthority']) {
    assert.equal(source.includes(marker), false, `binding layer owns/imports forbidden authority surface ${marker}`);
  }
});
