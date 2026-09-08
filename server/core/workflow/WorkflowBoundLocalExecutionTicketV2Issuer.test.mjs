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

test('server-owned async workflow context changes only workflowId for admitted deterministic steps', async () => {
  const { issuer, issued } = runtime(undefined);
  await issuer.withWorkflowBinding({ scope, workflowId: 'agent-workflow', allowedStepIds: ['resize'] }, async () => {
    await Promise.resolve();
    await issuer.issue(request());
  });
  assert.equal(issued[0].requestId, 'child-execution');
  assert.equal(issued[0].workflowId, 'agent-workflow');
  assert.equal(issued[0].stepId, 'resize');

  await issuer.issue(request({ idempotencyKey: 'next:resize:local-v2' }));
  assert.equal(issued[1].workflowId, 'child-execution', 'binding must disappear after the exact server-owned async call');
});

test('workflow binding fails closed for foreign scope or an unadmitted nested step', async () => {
  const scoped = runtime(undefined);
  await scoped.issuer.withWorkflowBinding({ scope, workflowId: 'agent-workflow', allowedStepIds: ['resize'] }, async () => {
    await assert.rejects(
      () => scoped.issuer.issue(request({ scope: { ...scope, userId: 'foreign-user' } })),
      error => error?.code === 'WORKFLOW_LOCAL_TICKET_BINDING_CONFLICT',
    );
    await assert.rejects(
      () => scoped.issuer.issue(request({ stepId: 'orthogonal-transform', idempotencyKey: 'child:orthogonal:local-v2' })),
      error => error?.code === 'WORKFLOW_LOCAL_TICKET_BINDING_CONFLICT',
    );
  });
  assert.equal(scoped.issued.length, 0);
});

test('concurrent server workflow bindings do not leak across async call trees', async () => {
  const { issuer, issued } = runtime(undefined);
  await Promise.all([
    issuer.withWorkflowBinding({ scope, workflowId: 'workflow-a', allowedStepIds: ['resize'] }, async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      await issuer.issue(request({ requestId: 'child-a', workflowId: 'child-a', idempotencyKey: 'a:resize:local-v2' }));
    }),
    issuer.withWorkflowBinding({ scope, workflowId: 'workflow-b', allowedStepIds: ['resize'] }, async () => {
      await issuer.issue(request({ requestId: 'child-b', workflowId: 'child-b', idempotencyKey: 'b:resize:local-v2' }));
    }),
  ]);
  assert.equal(issued.find(value => value.requestId === 'child-a')?.workflowId, 'workflow-a');
  assert.equal(issued.find(value => value.requestId === 'child-b')?.workflowId, 'workflow-b');
});

test('durable ticket restores its workflowId after Core restart without an active transient binding', async () => {
  const durableTicket = Object.freeze({ requestId: 'child-execution', workflowId: 'agent-workflow', stepId: 'resize' });
  const { issuer, issued } = runtime(durableTicket);
  await issuer.issue(request());
  assert.equal(issued[0].workflowId, 'agent-workflow');
});

test('conflicting nested workflow contexts and durable idempotency substitution fail closed', async () => {
  const nested = runtime(undefined);
  await assert.rejects(
    () => nested.issuer.withWorkflowBinding({ scope, workflowId: 'workflow-a', allowedStepIds: ['resize'] }, () =>
      nested.issuer.withWorkflowBinding({ scope, workflowId: 'workflow-b', allowedStepIds: ['resize'] }, async () => undefined)),
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
