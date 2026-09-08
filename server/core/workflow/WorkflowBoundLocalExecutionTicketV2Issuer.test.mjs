import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowBoundLocalExecutionTicketV2Issuer } from './WorkflowBoundLocalExecutionTicketV2Issuer.ts';

const scope = Object.freeze({ tenantId: 'tenant-agent', userId: 'user-agent', projectId: 'project-agent' });
function request(overrides = {}) {
  return Object.freeze({
    ticketVersion: '2', requestId: 'child-execution', workflowId: 'child-execution', stepId: 'resize',
    operation: Object.freeze({ id: 'resize', version: '1', type: 'RESIZE', capability: 'local:deterministic:resize:v1' }),
    scope, inputs: Object.freeze([{ artifactId: 'source', kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64) }]),
    expectedOutputs: Object.freeze([{ kind: 'image', role: 'COMPOSITE', count: 1 }]), policy: 'LOCAL_ONLY', idempotencyKey: 'child:resize:local-v2',
    ...overrides,
  });
}
function runtime(durableTicket) {
  const issued = [];
  const delegate = Object.freeze({ async issue(input) { issued.push(input); return Object.freeze({ ...input, ticketId: 'ticket', version: '2' }); } });
  const durable = Object.freeze({ async getByIdempotencyKeyV2() { return durableTicket; } });
  return { issuer: new WorkflowBoundLocalExecutionTicketV2Issuer(delegate, durable), issued };
}

test('normal deterministic v2 issuance preserves the existing child workflow binding', async () => {
  const { issuer, issued } = runtime(undefined);
  await issuer.issue(request());
  assert.equal(issued.length, 1);
  assert.equal(issued[0].workflowId, 'child-execution');
});

test('server-owned workflow binding changes only workflowId for one exact scoped child request', async () => {
  const { issuer, issued } = runtime(undefined);
  await issuer.withWorkflowBinding({ scope, requestId: 'child-execution', workflowId: 'agent-workflow' }, async () => {
    await issuer.issue(request());
  });
  assert.equal(issued[0].requestId, 'child-execution');
  assert.equal(issued[0].workflowId, 'agent-workflow');
  assert.equal(issued[0].stepId, 'resize');

  await issuer.issue(request({ idempotencyKey: 'next:resize:local-v2' }));
  assert.equal(issued[1].workflowId, 'child-execution', 'binding must be removed after the server-owned call');
});

test('durable ticket restores its workflowId after Core restart without an active transient binding', async () => {
  const durableTicket = Object.freeze({ requestId: 'child-execution', workflowId: 'agent-workflow', stepId: 'resize' });
  const { issuer, issued } = runtime(durableTicket);
  await issuer.issue(request());
  assert.equal(issued[0].workflowId, 'agent-workflow');
});

test('conflicting active workflow bindings and durable idempotency substitution fail closed', async () => {
  const nested = runtime(undefined);
  await assert.rejects(
    () => nested.issuer.withWorkflowBinding({ scope, requestId: 'child-execution', workflowId: 'workflow-a' }, () =>
      nested.issuer.withWorkflowBinding({ scope, requestId: 'child-execution', workflowId: 'workflow-b' }, async () => undefined)),
    error => error?.code === 'WORKFLOW_LOCAL_TICKET_BINDING_CONFLICT',
  );

  const durableTicket = Object.freeze({ requestId: 'other-child', workflowId: 'agent-workflow', stepId: 'resize' });
  const conflict = runtime(durableTicket);
  await assert.rejects(
    () => conflict.issuer.issue(request()),
    error => error?.code === 'WORKFLOW_LOCAL_TICKET_BINDING_CONFLICT',
  );
  assert.equal(conflict.issued.length, 0);
});
