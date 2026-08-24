import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresLocalExecutionLedger } from './PostgresLocalExecutionLedger.ts';

const databaseUrl = process.env.DATABASE_URL;

function scope(token) { return Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user`, projectId: `${token}-project` }); }
function ticket(token, overrides = {}) {
  return Object.freeze({
    ticketId: `${token}-ticket-v2`, version: '2', issuer: 'CORE',
    requestId: `${token}-request`, workflowId: `${token}-request`, stepId: 'background-isolation',
    operation: Object.freeze({ id: 'background-isolation', version: '1', type: 'BACKGROUND_ISOLATION', capability: 'local:tool:background-isolation:v1', parameters: Object.freeze({ sourceArtifactId: `${token}-source`, maskArtifactId: `${token}-mask`, deterministicTool: 'background-isolation@1' }) }),
    scope: scope(token),
    inputs: Object.freeze([
      Object.freeze({ artifactId: `${token}-source`, kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64) }),
      Object.freeze({ artifactId: `${token}-mask`, kind: 'mask', role: 'MASK', sha256: 'b'.repeat(64) }),
    ]),
    expectedOutputs: Object.freeze([Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: 2, height: 2 })]),
    allowedExecutors: Object.freeze([Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' })]),
    policy: 'LOCAL_ONLY', idempotencyKey: `${token}-idem`, nonce: `${token}-nonce`, issuedAt: 1_000, expiresAt: 61_000,
    cost: Object.freeze({ paidCloudCredits: 0, providerCalls: 0 }),
    ...overrides,
  });
}
function result(stored) {
  return Object.freeze({
    ticketId: stored.ticketId, ticketVersion: '2', requestId: stored.requestId, workflowId: stored.workflowId, stepId: stored.stepId, nonce: stored.nonce,
    executor: Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' }),
    runtime: 'BROWSER_JS', accelerator: 'cpu',
    outputs: Object.freeze([Object.freeze({ uploadId: `${stored.ticketId}-upload`, kind: 'image', role: 'COMPOSITE', sha256: 'c'.repeat(64), sizeBytes: 64, mimeType: 'image/png', width: 2, height: 2 })]),
    metrics: Object.freeze({ latencyMs: 4 }),
  });
}

test('PostgreSQL v2 deterministic ticket survives Core restart and reconciles idempotency/finalization', { skip: !databaseUrl }, async () => {
  const token = `local-ledger-v2-${process.pid}-${Date.now()}`;
  const firstPool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-local-ledger-v2-first' });
  let stored;
  try {
    const first = new PostgresLocalExecutionLedger(firstPool);
    stored = await first.issueV2(ticket(token));
    assert.equal(stored.version, '2');
    assert.equal(stored.allowedExecutors[0].kind, 'DETERMINISTIC_TOOL');
  } finally {
    await firstPool.end();
  }

  const secondPool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-local-ledger-v2-after-restart' });
  const second = new PostgresLocalExecutionLedger(secondPool);
  try {
    assert.deepEqual(await second.getV2(stored.ticketId), stored, 'a new Core process must read the exact durable v2 ticket');
    assert.deepEqual(await second.getByIdempotencyKeyV2(stored.scope, stored.idempotencyKey), stored, 'scoped v2 idempotency must survive restart');

    const replayCandidate = ticket(token, { ticketId: `${token}-replacement-ticket`, nonce: `${token}-replacement-nonce`, issuedAt: 2_000, expiresAt: 62_000 });
    const reconciled = await second.issueV2(replayCandidate);
    assert.equal(reconciled.ticketId, stored.ticketId, 'same authority binding must return the original durable v2 ticket after restart');
    assert.equal(reconciled.nonce, stored.nonce);

    const crossVersion = Object.freeze({
      ticketId: `${token}-v1-rebind`, version: '1', issuer: 'CORE', requestId: stored.requestId, workflowId: stored.workflowId, stepId: stored.stepId,
      operation: stored.operation, scope: stored.scope, inputs: stored.inputs, expectedOutputs: stored.expectedOutputs,
      allowedModels: Object.freeze([Object.freeze({ modelId: 'fake-model', version: '1' })]), policy: stored.policy,
      idempotencyKey: stored.idempotencyKey, nonce: `${token}-v1-nonce`, issuedAt: 2_000, expiresAt: 62_000, cost: stored.cost,
    });
    await assert.rejects(() => second.issue(crossVersion), /idempotency key already bound to another execution/, 'durable scoped idempotency cannot be rebound across v1/v2');

    const admitted = await second.claimV2({ ticketId: stored.ticketId, result: result(stored), callerScope: stored.scope, now: 2_500 });
    assert.equal(admitted.allowed, true);
    await second.commit(stored.ticketId, 'SUCCESS');
    assert.equal((await second.getFinalization(stored.ticketId))?.status, 'SUCCESS');
  } finally {
    await secondPool.end();
  }

  const thirdPool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-local-ledger-v2-final-restart' });
  try {
    const third = new PostgresLocalExecutionLedger(thirdPool);
    assert.equal((await third.getFinalization(stored.ticketId))?.status, 'SUCCESS', 'terminal v2 finalization must survive another Core restart');
    assert.equal((await third.claimV2({ ticketId: stored.ticketId, result: result(stored), callerScope: stored.scope, now: 2_600 })).reasonCode, 'REPLAYED_TICKET');
    await thirdPool.query('DELETE FROM local_execution_tickets WHERE idempotency_key=$1', [`${token}-idem`]);
  } finally {
    await thirdPool.end();
  }
});
