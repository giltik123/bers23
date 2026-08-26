import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresLocalExecutionLedger } from '../localExecution/PostgresLocalExecutionLedger.ts';
import { PostgresWorkflowContinuationStore } from './PostgresWorkflowContinuationStore.ts';
import { checkWorkflowContinuationSchema, migrateWorkflowContinuationSchema } from './workflowContinuationSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
const NOW = Date.parse('2026-08-26T06:00:00.000Z');
const scope = token => Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user`, projectId: `${token}-project` });

function rootInput(token) {
  return Object.freeze({ artifactId: `${token}-source`, kind: 'image', role: 'WORKING', sha256: 'b'.repeat(64), parentArtifactIds: Object.freeze([]) });
}
function ticket(token, executionId, scoped) {
  return Object.freeze({
    ticketId: `${token}-ticket`, version: '1', issuer: 'CORE', requestId: `${token}-request`, workflowId: executionId, stepId: 'segment',
    operation: Object.freeze({ id: 'segment', version: '1', type: 'segment', capability: 'local:mobilesam:segment:v1', parameters: Object.freeze({ selectionRequestId: `${token}-selection`, analysis: Object.freeze({ originalWidth: 2, originalHeight: 2, analysisWidth: 2, analysisHeight: 2, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }), points: Object.freeze([Object.freeze({ x: 0, y: 0, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' })]) }) }),
    scope: scoped,
    inputs: Object.freeze([Object.freeze({ artifactId: `${token}-source`, kind: 'image', role: 'WORKING', sha256: 'b'.repeat(64) })]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'mask', role: 'MASK', count: 1, mimeTypes: Object.freeze(['application/octet-stream']), width: 2, height: 2 })]),
    allowedModels: Object.freeze([Object.freeze({ modelId: 'mobilesam-vit-t', version: '1.0.2' })]),
    policy: 'LOCAL_ONLY', idempotencyKey: `${token}-ticket-idem`, nonce: `${token}-nonce`, issuedAt: NOW, expiresAt: NOW + 60_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
  });
}
function result(stored) {
  return Object.freeze({
    ticketId: stored.ticketId, ticketVersion: stored.version, requestId: stored.requestId, workflowId: stored.workflowId, stepId: stored.stepId, nonce: stored.nonce,
    model: stored.allowedModels[0], runtime: 'WASM', accelerator: 'wasm',
    outputs: Object.freeze([Object.freeze({ uploadId: `${stored.ticketId}-upload`, kind: 'mask', role: 'MASK', sha256: 'c'.repeat(64), sizeBytes: 4, mimeType: 'application/octet-stream', width: 2, height: 2 })]),
    metrics: Object.freeze({ latencyMs: 8 }),
  });
}

test('PostgreSQL continuation survives Core restart with immutable roots and serializes exact local completion', { skip: !databaseUrl }, async () => {
  const token = `workflow-continuation-${process.pid}-${Date.now()}`;
  const scoped = scope(token); const executionId = `${token}-execution`; const clientRequestId = `${token}-client`;
  const plan = Object.freeze({ planId: `${token}-plan`, planRevision: '1', planDigest: 'a'.repeat(64) });
  const inputArtifacts = Object.freeze([rootInput(token)]);
  let storedTicket;

  const firstPool = new Pool({ connectionString: databaseUrl, max: 3, application_name: 'bers-workflow-continuation-first' });
  try {
    // Keep this integration test autonomous when it is discovered by the broad server:test command.
    // The dedicated C5A workflow separately applies the exact SQL migration chain before running this test,
    // so this test bootstrap does not replace the hosted production-migration acceptance gate.
    await migrateWorkflowContinuationSchema(firstPool);
    await checkWorkflowContinuationSchema(firstPool);
    const continuations = new PostgresWorkflowContinuationStore(firstPool, () => NOW);
    const ledger = new PostgresLocalExecutionLedger(firstPool);
    const created = await continuations.create({ executionId, clientRequestId, scope: scoped, plan, inputArtifacts });
    assert.deepEqual(created.inputArtifacts, inputArtifacts, 'Core must persist the exact immutable root Artifact identity/integrity binding');
    await assert.rejects(() => continuations.create({
      executionId, clientRequestId, scope: scoped, plan,
      inputArtifacts: [{ ...rootInput(token), sha256: 'd'.repeat(64) }],
    }), /already bound to another workflow continuation/, 'scoped replay cannot rebind a root Artifact digest');
    storedTicket = await ledger.issue(ticket(token, executionId, scoped));
    const waiting = await continuations.waitForLocalResult({ executionId, scope: scoped, expectedRevision: created.revision, ticket: { stepId: storedTicket.stepId, ticketId: storedTicket.ticketId, ticketVersion: storedTicket.version, nonce: storedTicket.nonce, expiresAt: new Date(storedTicket.expiresAt).toISOString() } });
    assert.equal(waiting.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(waiting.revision, 1);
  } finally { await firstPool.end(); }

  const secondPool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-workflow-continuation-second' });
  try {
    const first = new PostgresWorkflowContinuationStore(secondPool, () => NOW);
    const second = new PostgresWorkflowContinuationStore(secondPool, () => NOW);
    const ledger = new PostgresLocalExecutionLedger(secondPool);
    const recovered = await first.get(executionId, scoped);
    assert.equal(recovered.state, 'WAITING_FOR_LOCAL_RESULT', 'new Core instance must recover outstanding local step');
    assert.equal(recovered.outstandingLocal.ticketId, storedTicket.ticketId);
    assert.deepEqual(recovered.inputArtifacts, inputArtifacts, 'new Core instance must recover exact immutable root Artifact bindings');

    const admitted = await ledger.claim({ ticketId: storedTicket.ticketId, result: result(storedTicket), callerScope: scoped, now: NOW + 1_000 });
    assert.equal(admitted.allowed, true); await ledger.commit(storedTicket.ticketId, 'SUCCESS');

    const completion = { executionId, scope: scoped, expectedRevision: recovered.revision, stepId: storedTicket.stepId, ticketId: storedTicket.ticketId, artifactIds: [`${token}-canonical-mask`] };
    const [a, b] = await Promise.all([first.completeLocalStep(completion), second.completeLocalStep(completion)]);
    assert.deepEqual(a, b, 'concurrent exact completion must converge on one durable binding');
    assert.equal(a.revision, 2); assert.equal(a.completedSteps.length, 1);
    await assert.rejects(() => first.completeLocalStep({ ...completion, expectedRevision: 2, artifactIds: [`${token}-other-mask`] }), /different canonical result/);

    const running = await first.runInternalStep({ executionId, scope: scoped, expectedRevision: 2, stepId: 'verify' });
    const verified = await first.completeInternalStep({ executionId, scope: scoped, expectedRevision: running.revision, stepId: 'verify', artifactIds: [`${token}-canonical-mask`] });
    const success = await first.succeed({ executionId, scope: scoped, expectedRevision: verified.revision, terminalArtifactId: `${token}-canonical-mask` });
    assert.equal(success.state, 'SUCCESS'); assert.equal(success.revision, 5);
  } finally { await secondPool.end(); }

  const thirdPool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-workflow-continuation-third' });
  try {
    const afterRestart = new PostgresWorkflowContinuationStore(thirdPool, () => NOW);
    const terminal = await afterRestart.get(executionId, scoped);
    assert.equal(terminal.state, 'SUCCESS'); assert.equal(terminal.terminalArtifactId, `${token}-canonical-mask`);
    assert.deepEqual(terminal.inputArtifacts, inputArtifacts);
    assert.equal((await afterRestart.getByClientRequestId(scoped, clientRequestId)).executionId, executionId);
    await assert.rejects(() => afterRestart.cancel({ executionId, scope: scoped, expectedRevision: terminal.revision }), /Terminal workflow continuation SUCCESS cannot advance/);
  } finally {
    await thirdPool.query('DELETE FROM workflow_continuations WHERE execution_id=$1', [executionId]).catch(() => undefined);
    await thirdPool.query('DELETE FROM local_execution_tickets WHERE ticket_id=$1', [storedTicket.ticketId]).catch(() => undefined);
    await thirdPool.end();
  }
});
