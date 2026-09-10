import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
  RESIZE_TOOL_DEFINITION,
} from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { PostgresLocalExecutionLedger } from '../localExecution/PostgresLocalExecutionLedger.ts';
import { PostgresWorkflowContinuationStore } from './PostgresWorkflowContinuationStore.ts';
import { checkWorkflowContinuationSchema, migrateWorkflowContinuationSchema } from './workflowContinuationSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
const NOW = Date.parse('2026-09-10T01:00:00.000Z');

function ticket(token, workflowId, scope, root, definition, expiresAt) {
  const resize = definition.operation.id === RESIZE_TOOL_DEFINITION.operation.id;
  const parameters = resize
    ? { sourceArtifactId: root.artifactId, width: 2, height: 2, ...definition.parameters.exact }
    : { sourceArtifactId: root.artifactId, mode: 'ROTATE_180', ...definition.parameters.exact };
  return Object.freeze({
    ticketId: `${token}-ticket`,
    version: '2',
    issuer: 'CORE',
    requestId: `${token}-request`,
    workflowId,
    stepId: definition.operation.id,
    operation: Object.freeze({
      id: definition.operation.id,
      version: definition.operation.version,
      type: definition.operation.type,
      capability: definition.capability,
      parameters: Object.freeze(parameters),
    }),
    scope,
    inputs: Object.freeze([Object.freeze({ artifactId: root.artifactId, kind: 'image', role: root.role, sha256: root.sha256 })]),
    expectedOutputs: Object.freeze([Object.freeze({
      kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2,
    })]),
    allowedExecutors: Object.freeze([definition.executor]),
    policy: 'LOCAL_ONLY',
    idempotencyKey: `${token}-${definition.operation.id}-idem`,
    nonce: `${token}-nonce`,
    issuedAt: NOW,
    expiresAt,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}

function binding(stored) {
  return Object.freeze({
    stepId: stored.stepId,
    ticketId: stored.ticketId,
    ticketVersion: stored.version,
    nonce: stored.nonce,
    expiresAt: new Date(stored.expiresAt).toISOString(),
  });
}

test('PostgreSQL keeps AEE logical node identity separate from repeated local operation step identity across restart/retry', { skip: !databaseUrl }, async () => {
  const token = `aee-logical-step-${process.pid}-${Date.now()}`;
  const scope = Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user`, projectId: `${token}-project` });
  const executionId = `${token}-execution`;
  const root = Object.freeze({ artifactId: `${token}-source`, kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64), parentArtifactIds: Object.freeze([]) });
  const plan = Object.freeze({ planId: 'aee-admitted-plan-v1', planRevision: '1', planDigest: 'b'.repeat(64) });
  const logicalNodeId = 'resize-second';
  let first;
  let replacement;
  let wrongOperation;

  const firstPool = new Pool({ connectionString: databaseUrl, max: 3, application_name: 'bers-aee-logical-step-first' });
  try {
    await migrateWorkflowContinuationSchema(firstPool);
    await checkWorkflowContinuationSchema(firstPool);
    const store = new PostgresWorkflowContinuationStore(firstPool, () => NOW);
    const ledger = new PostgresLocalExecutionLedger(firstPool);
    const created = await store.create({
      executionId,
      clientRequestId: `${token}-client`,
      scope,
      plan,
      inputArtifacts: Object.freeze([root]),
    });
    first = await ledger.issueV2(ticket(`${token}-first`, executionId, scope, root, RESIZE_TOOL_DEFINITION, NOW + 1_000));
    const waiting = await store.waitForLocalResult({
      executionId,
      scope,
      expectedRevision: created.revision,
      continuationStepId: logicalNodeId,
      ticket: binding(first),
    });
    assert.equal(waiting.currentStepId, logicalNodeId);
    assert.equal(waiting.outstandingLocal.stepId, logicalNodeId);
    assert.equal(first.stepId, RESIZE_TOOL_DEFINITION.operation.id);

    const persisted = await firstPool.query(`SELECT wc.current_step_id, t.step_id
      FROM workflow_continuations wc JOIN local_execution_tickets t ON t.ticket_id=wc.outstanding_ticket_id
      WHERE wc.execution_id=$1`, [executionId]);
    assert.equal(persisted.rows[0].current_step_id, logicalNodeId, 'continuation row must own logical node identity');
    assert.equal(persisted.rows[0].step_id, RESIZE_TOOL_DEFINITION.operation.id, 'ticket ledger must remain local operation authority');
  } finally { await firstPool.end(); }

  const secondPool = new Pool({ connectionString: databaseUrl, max: 3, application_name: 'bers-aee-logical-step-second' });
  try {
    const store = new PostgresWorkflowContinuationStore(secondPool, () => NOW + 2_000);
    const ledger = new PostgresLocalExecutionLedger(secondPool);
    const recovered = await store.get(executionId, scope);
    assert.equal(recovered.currentStepId, logicalNodeId);
    assert.equal(recovered.outstandingLocal.stepId, logicalNodeId);
    assert.equal(recovered.outstandingLocal.ticketId, first.ticketId);

    replacement = await ledger.issueV2(ticket(`${token}-replacement`, executionId, scope, root, RESIZE_TOOL_DEFINITION, NOW + 3_000));
    const retried = await store.retryLocalResult({
      executionId,
      scope,
      expectedRevision: recovered.revision,
      continuationStepId: logicalNodeId,
      previousTicketId: first.ticketId,
      ticket: binding(replacement),
    });
    assert.equal(retried.currentStepId, logicalNodeId);
    assert.equal(retried.outstandingLocal.stepId, logicalNodeId);
    assert.equal(retried.outstandingLocal.ticketId, replacement.ticketId);
  } finally { await secondPool.end(); }

  const thirdPool = new Pool({ connectionString: databaseUrl, max: 3, application_name: 'bers-aee-logical-step-third' });
  try {
    const store = new PostgresWorkflowContinuationStore(thirdPool, () => NOW + 4_000);
    const ledger = new PostgresLocalExecutionLedger(thirdPool);
    const recovered = await store.get(executionId, scope);
    wrongOperation = await ledger.issueV2(ticket(`${token}-wrong-operation`, executionId, scope, root, ORTHOGONAL_TRANSFORM_TOOL_DEFINITION, NOW + 60_000));
    await assert.rejects(
      () => store.retryLocalResult({
        executionId,
        scope,
        expectedRevision: recovered.revision,
        continuationStepId: logicalNodeId,
        previousTicketId: replacement.ticketId,
        ticket: binding(wrongOperation),
      }),
      /cannot change the underlying local operation step/,
    );
    const unchanged = await store.get(executionId, scope);
    assert.equal(unchanged.currentStepId, logicalNodeId);
    assert.equal(unchanged.outstandingLocal.ticketId, replacement.ticketId, 'failed operation substitution must roll back atomically');
  } finally {
    await thirdPool.query('DELETE FROM workflow_continuations WHERE execution_id=$1', [executionId]).catch(() => undefined);
    for (const stored of [first, replacement, wrongOperation]) {
      if (stored) await thirdPool.query('DELETE FROM local_execution_tickets WHERE ticket_id=$1', [stored.ticketId]).catch(() => undefined);
    }
    await thirdPool.end();
  }
});
