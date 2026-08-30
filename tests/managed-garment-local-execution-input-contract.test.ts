import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  LocalExecutionManagedGarmentInputBinding,
  LocalExecutionTicketV2,
} from '../src/platform/creative/canonical/localExecution.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';

const scope = Object.freeze({ tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' });
const viewBinding = Object.freeze({
  authority: 'MANAGED_GARMENT',
  kind: 'GARMENT_VIEW',
  garmentId: 'a1111111-1111-4111-8111-111111111111',
  viewId: 'b2222222-2222-4222-8222-222222222222',
  contentSha256: 'a'.repeat(64),
  contentType: 'image/png',
  encoding: 'PNG_RGBA8_LOSSLESS',
  width: 64,
  height: 96,
}) satisfies LocalExecutionManagedGarmentInputBinding;
const representationBinding = Object.freeze({
  authority: 'MANAGED_GARMENT',
  kind: 'GARMENT_REPRESENTATION',
  garmentId: viewBinding.garmentId,
  representationId: 'c3333333-3333-4333-8333-333333333333',
  tier: 'PARAMETRIC',
  format: 'BERS_PARAMETRIC_V1',
  contentType: 'application/vnd.bers.garment-parametric+json',
  contentSha256: 'b'.repeat(64),
  basisViewId: viewBinding.viewId,
  generatorId: 'local.mesh-fit',
  generatorVersion: '1.0.0',
  validatorId: 'bers.parametric-topology-validator',
  validatorVersion: '1',
}) satisfies LocalExecutionManagedGarmentInputBinding;

function ticket(token: string, managedInputs?: readonly LocalExecutionManagedGarmentInputBinding[]): LocalExecutionTicketV2 {
  return Object.freeze({
    ticketId: `${token}-ticket`, version: '2', issuer: 'CORE', requestId: `${token}-request`, workflowId: `${token}-workflow`, stepId: 'f4b2-contract',
    operation: Object.freeze({ id: 'f4b2-contract', version: '1', type: 'F4B2_CONTRACT', capability: 'local:tool:f4b2-contract:v1' }),
    scope,
    inputs: Object.freeze([Object.freeze({ artifactId: `${token}-project-image`, kind: 'image', role: 'ORIGINAL', sha256: 'c'.repeat(64) })]),
    ...(managedInputs === undefined ? {} : { managedInputs }),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']) })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'f4b2-contract', version: '1' })]),
    policy: 'LOCAL_ONLY', idempotencyKey: `${token}-idem`, nonce: `${token}-nonce`, issuedAt: 1_000, expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

test('F4b.2 preserves old v2 ticket shape when managedInputs is absent', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  const stored = registry.issueV2(ticket('legacy'));
  assert.equal(Object.hasOwn(stored, 'managedInputs'), false);
  assert.equal(JSON.stringify(stored).includes('managedInputs'), false);
  assert.deepEqual(registry.getV2(stored.ticketId), stored);
});

test('F4b.2 freezes managedInputs and includes them in idempotent authority reconciliation', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  const original = registry.issueV2(ticket('managed', [viewBinding, representationBinding]));
  assert.equal(original.managedInputs?.length, 2);
  assert.notEqual(original.managedInputs, [viewBinding, representationBinding]);
  assert.ok(Object.isFrozen(original.managedInputs));
  assert.ok(Object.isFrozen(original.managedInputs?.[0]));

  const replacement = ticket('replacement', [viewBinding, representationBinding]);
  const sameBinding = registry.issueV2(Object.freeze({
    ...replacement,
    idempotencyKey: original.idempotencyKey,
    requestId: original.requestId,
    workflowId: original.workflowId,
    stepId: original.stepId,
    operation: original.operation,
    scope: original.scope,
    inputs: original.inputs,
    expectedOutputs: original.expectedOutputs,
    allowedExecutors: original.allowedExecutors,
  }));
  assert.equal(sameBinding.ticketId, original.ticketId);

  const changed = Object.freeze({ ...viewBinding, contentSha256: 'd'.repeat(64) }) satisfies LocalExecutionManagedGarmentInputBinding;
  assert.throws(() => registry.issueV2(Object.freeze({
    ...replacement,
    idempotencyKey: original.idempotencyKey,
    requestId: original.requestId,
    workflowId: original.workflowId,
    stepId: original.stepId,
    operation: original.operation,
    scope: original.scope,
    inputs: original.inputs,
    managedInputs: Object.freeze([changed, representationBinding]),
    expectedOutputs: original.expectedOutputs,
    allowedExecutors: original.allowedExecutors,
  })), /idempotency key already bound/i);
});

test('F4b.2 rejects empty, open-ended and inconsistent managed Garment bindings', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  assert.throws(() => registry.issueV2(ticket('empty', [])), /1 to 16/);
  assert.throws(() => registry.issueV2(ticket('unknown', [Object.freeze({ ...viewBinding, unexpected: true }) as any])), /unknown or missing fields/);
  assert.throws(() => registry.issueV2(ticket('format', [Object.freeze({
    ...representationBinding,
    tier: 'FULL_3D',
    format: 'BERS_PARAMETRIC_V1',
  }) as any])), /tier\/format/);
  assert.throws(() => registry.issueV2(ticket('uppercase', [Object.freeze({ ...viewBinding, garmentId: viewBinding.garmentId.toUpperCase() }) as any])), /identity/);
});

test('F4b.2 ticket authority copies managedInputs only for v2 and never synthesizes them for legacy v2 calls', async () => {
  const registry = new LocalExecutionAdmissionRegistry();
  let sequence = 0;
  const authority = new LocalExecutionTicketAuthority(registry, {
    now: () => 10_000,
    id: () => `authority-ticket-${++sequence}`,
    nonce: () => `authority-nonce-${sequence}`,
    ttlMs: 30_000,
    modelsByCapability: {},
    executorsByCapability: Object.freeze({ 'local:tool:f4b2-contract:v1': Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'f4b2-contract', version: '1' })]) }),
  });
  const base = Object.freeze({
    ticketVersion: '2' as const,
    requestId: 'authority-request', workflowId: 'authority-workflow', stepId: 'f4b2-contract',
    operation: Object.freeze({ id: 'f4b2-contract', version: '1', type: 'F4B2_CONTRACT', capability: 'local:tool:f4b2-contract:v1' }),
    scope,
    inputs: Object.freeze([Object.freeze({ artifactId: 'authority-project-image', kind: 'image', role: 'ORIGINAL' as const, sha256: 'e'.repeat(64) })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE' as const, count: 1, mimeTypes: Object.freeze(['image/png']) })]),
    policy: 'LOCAL_ONLY' as const,
  });
  const legacy = await authority.issue(Object.freeze({ ...base, idempotencyKey: 'authority-legacy' }));
  assert.equal(Object.hasOwn(legacy, 'managedInputs'), false);
  const managed = await authority.issue(Object.freeze({ ...base, idempotencyKey: 'authority-managed', managedInputs: Object.freeze([viewBinding]) }));
  assert.deepEqual(managed.managedInputs, [viewBinding]);
});
