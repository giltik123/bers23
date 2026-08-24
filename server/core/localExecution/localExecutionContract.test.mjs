import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalExecutionAdmissionRegistry } from './LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from './LocalExecutionTicketAuthority.ts';

const scope = Object.freeze({ tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' });
const ticket = (overrides = {}) => ({
  ticketId: 'ticket-1',
  version: '1',
  issuer: 'CORE',
  requestId: 'request-1',
  workflowId: 'workflow-1',
  stepId: 'segment-step',
  operation: { id: 'segment', version: '1', type: 'segment', capability: 'local:mobilesam:segment:v1' },
  scope: { ...scope },
  inputs: [{ artifactId: 'input-1', kind: 'image', role: 'WORKING', sha256: 'a'.repeat(64) }],
  expectedOutputs: [{ kind: 'mask', role: 'MASK', count: 1, mimeTypes: ['image/png'] }],
  allowedModels: [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }],
  policy: 'LOCAL_SELECTED',
  idempotencyKey: 'idem-1',
  nonce: 'nonce-1',
  issuedAt: 1_000,
  expiresAt: 61_000,
  cost: { paidCloudCredits: 0, providerCalls: 0 },
  ...overrides,
});
const result = (overrides = {}) => ({
  ticketId: 'ticket-1',
  ticketVersion: '1',
  requestId: 'request-1',
  workflowId: 'workflow-1',
  stepId: 'segment-step',
  nonce: 'nonce-1',
  model: { modelId: 'mobilesam-vit-t', version: '1.0.2' },
  runtime: 'WASM',
  accelerator: 'wasm',
  outputs: [{ uploadId: 'upload-1', kind: 'mask', role: 'MASK', sha256: 'b'.repeat(64), sizeBytes: 1024, mimeType: 'image/png', width: 256, height: 256 }],
  metrics: { latencyMs: 25, memoryBytes: 8_000_000 },
  ...overrides,
});

test('admits one matching local result and then rejects replay', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  registry.issue(ticket());
  const accepted = registry.admit({ ticketId: 'ticket-1', result: result(), callerScope: scope, now: 2_000 });
  assert.equal(accepted.allowed, true);
  assert.equal(accepted.reasonCode, 'ADMITTED');
  assert.equal('canonicalArtifactId' in accepted, false);
  assert.equal(registry.admit({ ticketId: 'ticket-1', result: result(), callerScope: scope, now: 2_001 }).reasonCode, 'REPLAYED_TICKET');
});

test('fails closed for cross-scope, expiry, forged identity and unapproved model', () => {
  const crossScope = new LocalExecutionAdmissionRegistry(); crossScope.issue(ticket());
  assert.equal(crossScope.admit({ ticketId: 'ticket-1', result: result(), callerScope: { ...scope, projectId: 'other' }, now: 2_000 }).reasonCode, 'SCOPE_MISMATCH');
  const expired = new LocalExecutionAdmissionRegistry(); expired.issue(ticket());
  assert.equal(expired.admit({ ticketId: 'ticket-1', result: result(), callerScope: scope, now: 61_000 }).reasonCode, 'EXPIRED_TICKET');
  const forged = new LocalExecutionAdmissionRegistry(); forged.issue(ticket());
  assert.equal(forged.admit({ ticketId: 'ticket-1', result: result({ workflowId: 'other-workflow' }), callerScope: scope, now: 2_000 }).reasonCode, 'IDENTITY_MISMATCH');
  const wrongModel = new LocalExecutionAdmissionRegistry(); wrongModel.issue(ticket());
  assert.equal(wrongModel.admit({ ticketId: 'ticket-1', result: result({ model: { modelId: 'other-model', version: '9' } }), callerScope: scope, now: 2_000 }).reasonCode, 'MODEL_MISMATCH');
});

test('rejects client attempts to claim canonical, billing, provider or verification authority', () => {
  for (const injected of [
    { canonicalArtifactId: 'client-owned' },
    { billing: { credits: 0 } },
    { providerId: 'fal' },
    { verification: { valid: true } },
    { outputs: [{ ...result().outputs[0], artifactId: 'client-artifact' }] },
  ]) {
    const registry = new LocalExecutionAdmissionRegistry(); registry.issue(ticket());
    assert.equal(registry.admit({ ticketId: 'ticket-1', result: result(injected), callerScope: scope, now: 2_000 }).reasonCode, 'FORBIDDEN_CLIENT_AUTHORITY');
  }
});

test('rejects malformed integrity evidence, runtime and output contract mismatch', () => {
  const badHash = new LocalExecutionAdmissionRegistry(); badHash.issue(ticket());
  assert.equal(badHash.admit({ ticketId: 'ticket-1', result: result({ outputs: [{ ...result().outputs[0], sha256: 'bad' }] }), callerScope: scope, now: 2_000 }).reasonCode, 'MALFORMED_RESULT');
  const badRuntime = new LocalExecutionAdmissionRegistry(); badRuntime.issue(ticket());
  assert.equal(badRuntime.admit({ ticketId: 'ticket-1', result: result({ runtime: 'REMOTE_MAGIC' }), callerScope: scope, now: 2_000 }).reasonCode, 'MALFORMED_RESULT');
  const wrongKind = new LocalExecutionAdmissionRegistry(); wrongKind.issue(ticket());
  assert.equal(wrongKind.admit({ ticketId: 'ticket-1', result: result({ outputs: [{ ...result().outputs[0], kind: 'image' }] }), callerScope: scope, now: 2_000 }).reasonCode, 'OUTPUT_CONTRACT_MISMATCH');
});

test('ticket issuance stores an immutable server-owned copy', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  const mutable = ticket();
  const stored = registry.issue(mutable);
  mutable.scope.projectId = 'attacker-project';
  mutable.operation.capability = 'forged-capability';
  mutable.allowedModels[0].version = 'attacker-version';
  mutable.cost.paidCloudCredits = 99;
  assert.equal(stored.scope.projectId, 'project-a');
  assert.equal(stored.operation.capability, 'local:mobilesam:segment:v1');
  assert.equal(stored.allowedModels[0].version, '1.0.2');
  assert.equal(stored.cost.paidCloudCredits, 0);
  assert.equal(registry.get('ticket-1').scope.projectId, 'project-a');
});

test('ticket issuance itself cannot authorize paid cloud cost', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  assert.throws(() => registry.issue(ticket({ cost: { paidCloudCredits: 1, providerCalls: 0 } })), /cannot authorize cloud cost/);
  assert.throws(() => registry.issue(ticket({ cost: { paidCloudCredits: 0, providerCalls: 1 } })), /cannot authorize cloud cost/);
  assert.throws(() => registry.issue(ticket({ allowedModels: [] })), /approved model/);
});

test('Core ticket authority pins models by capability and mints zero-cloud tickets', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  const authority = new LocalExecutionTicketAuthority(registry, {
    now: () => 10_000,
    id: () => 'ticket-authority-1',
    nonce: () => 'nonce-authority-1',
    ttlMs: 30_000,
    modelsByCapability: { 'local:mobilesam:segment:v1': [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }] },
  });
  const issued = authority.issue({ requestId: 'request-1', workflowId: 'workflow-1', stepId: 'segment-step', operation: ticket().operation, scope, inputs: ticket().inputs, expectedOutputs: ticket().expectedOutputs, policy: 'LOCAL_SELECTED', idempotencyKey: 'authority-idem' });
  assert.deepEqual(issued.allowedModels, [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }]);
  assert.deepEqual(issued.cost, { paidCloudCredits: 0, providerCalls: 0 });
  assert.equal(issued.expiresAt, 40_000);
  assert.throws(() => authority.issue({ requestId: 'r2', workflowId: 'w2', stepId: 'x', operation: { id: 'x', version: '1', type: 'x', capability: 'unknown' }, scope, inputs: [], expectedOutputs: [{ kind: 'mask', count: 1 }], policy: 'LOCAL_SELECTED', idempotencyKey: 'x' }), /No approved local models/);
});
