import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalExecutionAdmissionRegistry } from './LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from './LocalExecutionTicketAuthority.ts';

const scope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const issueRequest = { requestId: 'request', workflowId: 'workflow', stepId: 'segment', operation: { id: 'segment', version: '1', type: 'segment', capability: 'local:mobilesam:segment:v1' }, scope, inputs: [{ artifactId: 'input', kind: 'image', sha256: 'a'.repeat(64) }], expectedOutputs: [{ kind: 'mask', role: 'MASK', count: 1 }], policy: 'LOCAL_SELECTED', idempotencyKey: 'idem:segment' };

test('same idempotency binding returns the original ticket and nonce', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  let id = 0; let nonce = 0;
  const authority = new LocalExecutionTicketAuthority(registry, { now: () => 1_000, id: () => `ticket-${++id}`, nonce: () => `nonce-${++nonce}`, ttlMs: 60_000, modelsByCapability: { 'local:mobilesam:segment:v1': [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }] } });
  const first = authority.issue(issueRequest);
  const second = authority.issue(issueRequest);
  assert.equal(first.ticketId, 'ticket-1');
  assert.equal(second.ticketId, first.ticketId);
  assert.equal(second.nonce, first.nonce);
});

test('same-scope idempotency key cannot be rebound to another workflow', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  let id = 0;
  const authority = new LocalExecutionTicketAuthority(registry, { now: () => 1_000, id: () => `ticket-${++id}`, nonce: () => `nonce-${id}`, ttlMs: 60_000, modelsByCapability: { 'local:mobilesam:segment:v1': [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }] } });
  authority.issue(issueRequest);
  assert.throws(() => authority.issue({ ...issueRequest, workflowId: 'other-workflow' }), /another execution/);
});

test('same client idempotency key remains independent across canonical project scopes', () => {
  const registry = new LocalExecutionAdmissionRegistry();
  let id = 0;
  const authority = new LocalExecutionTicketAuthority(registry, { now: () => 1_000, id: () => `ticket-${++id}`, nonce: () => `nonce-${id}`, ttlMs: 60_000, modelsByCapability: { 'local:mobilesam:segment:v1': [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }] } });
  const first = authority.issue(issueRequest);
  const second = authority.issue({ ...issueRequest, requestId: 'other-request', workflowId: 'other-workflow', scope: { ...scope, projectId: 'other-project' } });
  assert.notEqual(second.ticketId, first.ticketId);
  assert.equal(second.idempotencyKey, first.idempotencyKey);
  assert.equal(second.scope.projectId, 'other-project');
});
