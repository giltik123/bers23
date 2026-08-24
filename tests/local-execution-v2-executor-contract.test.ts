import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import type { LocalExecutionResult, LocalExecutionResultV2 } from '../src/platform/creative/canonical/localExecution.ts';

const scope = Object.freeze({ tenantId: 'tenant', userId: 'user', projectId: 'project' });
const output = Object.freeze({ uploadId: 'upload-1', kind: 'image', role: 'COMPOSITE' as const, sha256: 'a'.repeat(64), sizeBytes: 16, mimeType: 'image/png', width: 2, height: 2 });

function setup() {
  const ledger = new LocalExecutionAdmissionRegistry();
  let sequence = 0;
  const authority = new LocalExecutionTicketAuthority(ledger, {
    now: () => 1000,
    id: () => `ticket-${++sequence}`,
    nonce: () => `nonce-${sequence}`,
    ttlMs: 60_000,
    modelsByCapability: { 'local:model:test:v1': [{ modelId: 'model-a', version: '1.0.0' }] },
    executorsByCapability: {
      'local:tool:background-isolation:v1': [{ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' }],
      'local:model:test:v2': [{ kind: 'MODEL', modelId: 'model-b', version: '2.0.0' }],
    },
  });
  return { ledger, authority };
}

function baseIssue(capability: string, idempotencyKey: string) {
  return {
    requestId: `request-${idempotencyKey}`,
    workflowId: `workflow-${idempotencyKey}`,
    stepId: `step-${idempotencyKey}`,
    operation: { id: `step-${idempotencyKey}`, version: '1', type: 'test', capability },
    scope,
    inputs: [{ artifactId: 'source', kind: 'image', sha256: 'b'.repeat(64) }],
    expectedOutputs: [{ kind: 'image', role: 'COMPOSITE' as const, count: 1, mimeTypes: ['image/png'], width: 2, height: 2 }],
    policy: 'LOCAL_ONLY' as const,
    idempotencyKey,
  };
}

function v1Result(ticket: Awaited<ReturnType<LocalExecutionTicketAuthority['issue']>>): LocalExecutionResult {
  if (ticket.version !== '1') throw new Error('expected v1 fixture');
  return { ticketId: ticket.ticketId, ticketVersion: '1', requestId: ticket.requestId, workflowId: ticket.workflowId, stepId: ticket.stepId, nonce: ticket.nonce, model: { modelId: 'model-a', version: '1.0.0' }, runtime: 'ONNX_RUNTIME', accelerator: 'cpu', outputs: [output], metrics: { latencyMs: 1 } };
}

function v2Result(ticket: any, executor: LocalExecutionResultV2['executor'], runtime: LocalExecutionResultV2['runtime'] = 'BROWSER_JS'): LocalExecutionResultV2 {
  return { ticketId: ticket.ticketId, ticketVersion: '2', requestId: ticket.requestId, workflowId: ticket.workflowId, stepId: ticket.stepId, nonce: ticket.nonce, executor, runtime, accelerator: 'cpu', outputs: [output], metrics: { latencyMs: 1 } };
}

test('v1 model-only contract remains accepted through the original ledger surface', async () => {
  const { ledger, authority } = setup();
  const ticket = await authority.issue(baseIssue('local:model:test:v1', 'v1'));
  assert.equal(ticket.version, '1');
  const decision = ledger.admit({ ticketId: ticket.ticketId, result: v1Result(ticket), callerScope: scope, now: 1001 });
  assert.equal(decision.allowed, true);
  assert.equal(decision.allowed && decision.result.model.modelId, 'model-a');
});

test('v2 deterministic tool is exact-bound and model/tool substitution is denied', async () => {
  const { ledger, authority } = setup();
  const ticket = await authority.issue({ ...baseIssue('local:tool:background-isolation:v1', 'tool'), ticketVersion: '2' as const });
  assert.equal(ticket.version, '2');

  const wrongTool = ledger.claimV2({ ticketId: ticket.ticketId, result: v2Result(ticket, { kind: 'DETERMINISTIC_TOOL', toolId: 'other-tool', version: '1' }), callerScope: scope, now: 1001 });
  assert.deepEqual(wrongTool, { allowed: false, reasonCode: 'EXECUTOR_MISMATCH' });

  const crossKind = ledger.claimV2({ ticketId: ticket.ticketId, result: v2Result(ticket, { kind: 'MODEL', modelId: 'background-isolation', version: '1' }, 'ONNX_RUNTIME'), callerScope: scope, now: 1001 });
  assert.deepEqual(crossKind, { allowed: false, reasonCode: 'EXECUTOR_MISMATCH' });

  const admitted = ledger.admitV2({ ticketId: ticket.ticketId, result: v2Result(ticket, { kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' }), callerScope: scope, now: 1001 });
  assert.equal(admitted.allowed, true);
  assert.equal(admitted.allowed && admitted.result.executor.kind, 'DETERMINISTIC_TOOL');
});

test('v2 model executor cannot claim browser-js deterministic runtime', async () => {
  const { ledger, authority } = setup();
  const ticket = await authority.issue({ ...baseIssue('local:model:test:v2', 'model-v2'), ticketVersion: '2' as const });
  const bad = ledger.claimV2({ ticketId: ticket.ticketId, result: v2Result(ticket, { kind: 'MODEL', modelId: 'model-b', version: '2.0.0' }, 'BROWSER_JS'), callerScope: scope, now: 1001 });
  assert.deepEqual(bad, { allowed: false, reasonCode: 'MALFORMED_RESULT' });
  const good = ledger.admitV2({ ticketId: ticket.ticketId, result: v2Result(ticket, { kind: 'MODEL', modelId: 'model-b', version: '2.0.0' }, 'ONNX_RUNTIME'), callerScope: scope, now: 1001 });
  assert.equal(good.allowed, true);
});

test('typed ledger surfaces fail closed across ticket versions', async () => {
  const { ledger, authority } = setup();
  const v1 = await authority.issue(baseIssue('local:model:test:v1', 'surface-v1'));
  const v2 = await authority.issue({ ...baseIssue('local:tool:background-isolation:v1', 'surface-v2'), ticketVersion: '2' as const });
  assert.equal(ledger.get(v1.ticketId)?.version, '1');
  assert.equal(ledger.getV2(v2.ticketId)?.version, '2');
  assert.throws(() => ledger.get(v2.ticketId), /expected v1/);
  assert.throws(() => ledger.getV2(v1.ticketId), /expected v2/);
});

test('one scoped idempotency key cannot be rebound across schema versions', async () => {
  const { authority } = setup();
  await authority.issue(baseIssue('local:model:test:v1', 'same-key'));
  await assert.rejects(async () => authority.issue({ ...baseIssue('local:tool:background-isolation:v1', 'same-key'), ticketVersion: '2' as const }), /idempotency key already bound/);
});
