import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalExecutionAdmissionRegistry } from './LocalExecutionAdmission.ts';

const makeTicket = (scope, ticketId, workflowId = 'workflow') => ({
  ticketId,
  version: '1',
  issuer: 'CORE',
  requestId: `${workflowId}-request`,
  workflowId,
  stepId: 'segment',
  operation: { id: 'segment', version: '1', type: 'segment', capability: 'local:mobilesam:segment:v1' },
  scope,
  inputs: [{ artifactId: 'input', kind: 'image', role: 'WORKING', sha256: 'a'.repeat(64) }],
  expectedOutputs: [{ kind: 'mask', role: 'MASK', count: 1, mimeTypes: ['application/octet-stream'], width: 1, height: 1 }],
  allowedModels: [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }],
  policy: 'LOCAL_ONLY',
  idempotencyKey: 'same-client-request-id',
  nonce: `${ticketId}-nonce`,
  issuedAt: 1_000,
  expiresAt: 61_000,
  cost: { paidCloudCredits: 0, providerCalls: 0 },
});

test('same idempotency key is independent across canonical scopes but immutable within one scope', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  const firstScope = { tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' };
  const secondScope = { tenantId: 'tenant-b', userId: 'user-b', projectId: 'project-b' };
  const first = registry.issue(makeTicket(firstScope, 'ticket-a'));
  const second = registry.issue(makeTicket(secondScope, 'ticket-b'));
  assert.equal(first.ticketId, 'ticket-a');
  assert.equal(second.ticketId, 'ticket-b');
  assert.equal(registry.getByIdempotencyKey(firstScope, 'same-client-request-id')?.ticketId, 'ticket-a');
  assert.equal(registry.getByIdempotencyKey(secondScope, 'same-client-request-id')?.ticketId, 'ticket-b');
  assert.throws(() => registry.issue(makeTicket(firstScope, 'ticket-c', 'other-workflow')), /idempotency key already bound/);
});
