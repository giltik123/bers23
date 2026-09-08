import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
  RESIZE_TOOL_DEFINITION,
} from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { orthogonalTransformOutputGeometry } from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { DeterministicWorkflowStepFinalRecoveryAuthority } from './DeterministicWorkflowStepFinalRecoveryAuthority.ts';

const auth = Object.freeze({ tenantId: 'tenant-recovery', userId: 'user-recovery' });
const source = Object.freeze({
  artifactId: 'signed-source-artifact', role: 'ORIGINAL', sha256: 'a'.repeat(64), storageId: 'source-storage-id', width: 3, height: 2,
});
const expiresAt = '2026-09-08T08:00:00.000Z';

function binding(operation) {
  const common = {
    projectId: 'project-recovery', workflowId: 'agent-workflow-1',
    executionId: operation === 'ORTHOGONAL_TRANSFORM' ? 'agent-step-orthogonal-1' : 'agent-step-resize-1',
    idempotencyKey: operation === 'ORTHOGONAL_TRANSFORM' ? 'agent:orthogonal:attempt-1' : 'agent:resize:attempt-1',
    ticket: Object.freeze({ ticketId: operation === 'ORTHOGONAL_TRANSFORM' ? 'ticket-orthogonal' : 'ticket-resize', ticketVersion: '2', nonce: `${operation}-nonce`, expiresAt }),
    source,
  };
  return operation === 'ORTHOGONAL_TRANSFORM'
    ? Object.freeze({ ...common, operation, mode: 'ROTATE_90_CW' })
    : Object.freeze({ ...common, operation, width: 5, height: 4 });
}

function definition(value) { return value.operation === 'ORTHOGONAL_TRANSFORM' ? ORTHOGONAL_TRANSFORM_TOOL_DEFINITION : RESIZE_TOOL_DEFINITION; }
function geometry(value) { return value.operation === 'ORTHOGONAL_TRANSFORM' ? orthogonalTransformOutputGeometry(value.source.width, value.source.height, value.mode) : { width: value.width, height: value.height }; }

function ticket(value, overrides = {}) {
  const def = definition(value);
  const size = geometry(value);
  const parameters = value.operation === 'ORTHOGONAL_TRANSFORM'
    ? { sourceArtifactId: value.source.artifactId, mode: value.mode, ...def.parameters.exact }
    : { sourceArtifactId: value.source.artifactId, width: value.width, height: value.height, ...def.parameters.exact };
  return Object.freeze({
    ticketId: value.ticket.ticketId, version: '2', issuer: 'CORE', requestId: value.executionId, workflowId: value.workflowId,
    stepId: def.operation.id,
    operation: Object.freeze({ id: def.operation.id, version: def.operation.version, type: def.operation.type, capability: def.capability, parameters: Object.freeze(parameters) }),
    scope: Object.freeze({ ...auth, projectId: value.projectId }),
    inputs: Object.freeze([Object.freeze({ artifactId: value.source.artifactId, kind: 'image', role: value.source.role, sha256: value.source.sha256 })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: size.width, height: size.height })]),
    allowedExecutors: Object.freeze([def.executor]), policy: 'LOCAL_ONLY', idempotencyKey: value.idempotencyKey,
    nonce: value.ticket.nonce, issuedAt: Date.parse(expiresAt) - 60_000, expiresAt: Date.parse(expiresAt),
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
    ...overrides,
  });
}

function final(value, overrides = {}) {
  const def = definition(value); const size = geometry(value);
  return Object.freeze({
    storageId: `${value.executionId}-storage`, tenantId: auth.tenantId, userId: auth.userId, projectId: value.projectId,
    executionId: value.executionId, operationId: def.operation.id, role: 'COMPOSITE', lifecycle: 'FINAL',
    width: size.width, height: size.height, encoding: 'PNG_RGBA8_LOSSLESS', contentType: 'image/png', bytes: new Uint8Array([1,2,3]),
    sourceImageStorageId: value.source.storageId, producerOperation: def.lineage.producerOperation,
    ...overrides,
  });
}

function runtime(value, options = {}) {
  const finalization = Object.hasOwn(options, 'finalization') ? options.finalization : { status: 'SUCCESS' };
  const stored = Object.hasOwn(options, 'stored') ? options.stored : final(value);
  const durableTicket = Object.hasOwn(options, 'durableTicket') ? options.durableTicket : ticket(value);
  const calls = [];
  const authority = new DeterministicWorkflowStepFinalRecoveryAuthority({
    admission: Object.freeze({
      async getV2(ticketId) { calls.push(['getV2', ticketId]); return durableTicket; },
      async getFinalization(ticketId) { calls.push(['getFinalization', ticketId]); return finalization; },
    }),
    images: Object.freeze({ async loadFinalByExecution(executionId, scope) { calls.push(['loadFinal', executionId, scope]); return stored; } }),
    issueFinalId(storageId, scope) { calls.push(['issueFinalId', storageId, scope]); return `signed:${storageId}`; },
  });
  return { authority, calls };
}

for (const operation of ['ORTHOGONAL_TRANSFORM', 'RESIZE']) {
  test(`${operation} recovery returns only the already committed canonical FINAL`, async () => {
    const value = binding(operation); const { authority, calls } = runtime(value);
    const recovered = await authority.recover(value, auth);
    assert.deepEqual(recovered, { status: 'SUCCESS', executionId: value.executionId, artifactId: `signed:${value.executionId}-storage` });
    assert.deepEqual(calls.map(call => call[0]), ['getV2', 'getFinalization', 'loadFinal', 'issueFinalId']);
  });
}

test('recovery distinguishes PENDING, FAILED and UNKNOWN without reading or issuing a FINAL', async () => {
  const value = binding('RESIZE');
  for (const [finalization, status] of [[undefined, 'PENDING'], [{ status: 'FAILED' }, 'FAILED'], [{ status: 'UNKNOWN' }, 'UNKNOWN']]) {
    const { authority, calls } = runtime(value, { finalization });
    assert.deepEqual(await authority.recover(value, auth), { status, executionId: value.executionId });
    assert.deepEqual(calls.map(call => call[0]), ['getV2', 'getFinalization']);
  }
});

test('recovery fails closed on scope, zero-cloud, source and deterministic parameter substitution', async () => {
  const value = binding('ORTHOGONAL_TRANSFORM');
  const exact = ticket(value);

  await assert.rejects(() => runtime(value).authority.recover(value, { ...auth, userId: 'attacker' }), error => error?.status === 403 && error?.code === 'deterministic_workflow_recovery_scope_mismatch');
  await assert.rejects(() => runtime(value, { durableTicket: { ...exact, cost: { paidCloudCredits: 0, providerCalls: 1 } } }).authority.recover(value, auth), error => error?.code === 'deterministic_workflow_recovery_ticket_mismatch');
  await assert.rejects(() => runtime(value, { durableTicket: { ...exact, inputs: [{ ...exact.inputs[0], sha256: 'b'.repeat(64) }] } }).authority.recover(value, auth), error => error?.code === 'deterministic_workflow_recovery_ticket_mismatch');
  await assert.rejects(() => runtime(value, { durableTicket: { ...exact, operation: { ...exact.operation, parameters: { ...exact.operation.parameters, mode: 'ROTATE_180' } } } }).authority.recover(value, auth), error => error?.code === 'deterministic_workflow_recovery_ticket_mismatch');
  await assert.rejects(() => runtime(value, { durableTicket: { ...exact, operation: { ...exact.operation, capability: RESIZE_TOOL_DEFINITION.capability } } }).authority.recover(value, auth), error => error?.code === 'deterministic_workflow_recovery_ticket_mismatch');
});

test('SUCCESS recovery requires the exact persisted deterministic source lineage and geometry', async () => {
  const value = binding('RESIZE');
  await assert.rejects(() => runtime(value, { stored: undefined }).authority.recover(value, auth), error => error?.code === 'deterministic_workflow_recovery_final_unavailable');
  await assert.rejects(() => runtime(value, { stored: final(value, { sourceImageStorageId: 'other-source-storage' }) }).authority.recover(value, auth), error => error?.code === 'deterministic_workflow_recovery_lineage_mismatch');
  await assert.rejects(() => runtime(value, { stored: final(value, { width: value.width + 1 }) }).authority.recover(value, auth), error => error?.code === 'deterministic_workflow_recovery_lineage_mismatch');
});
