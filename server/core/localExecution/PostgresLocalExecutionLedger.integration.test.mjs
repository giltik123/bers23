import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresLocalExecutionLedger } from './PostgresLocalExecutionLedger.ts';

const databaseUrl = process.env.DATABASE_URL;

const scope = token => Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user`, projectId: `${token}-project` });
const ticket = (token, overrides = {}) => ({
  ticketId: `${token}-ticket-a`,
  version: '1',
  issuer: 'CORE',
  requestId: `${token}-request`,
  workflowId: `${token}-request`,
  stepId: 'interactive-segmentation',
  operation: { id: 'interactive-segmentation', version: '1', type: 'segment', capability: 'local:mobilesam:segment:v1', parameters: { selectionRequestId: `${token}-selection`, analysis: { originalWidth: 2, originalHeight: 2, analysisWidth: 2, analysisHeight: 2, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }, points: [{ x: 0, y: 0, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' }] } },
  scope: scope(token),
  inputs: [{ artifactId: `${token}-input`, kind: 'image', role: 'WORKING', sha256: 'a'.repeat(64) }],
  expectedOutputs: [{ kind: 'mask', role: 'MASK', count: 1, mimeTypes: ['application/octet-stream'], width: 2, height: 2 }],
  allowedModels: [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }],
  policy: 'LOCAL_ONLY',
  idempotencyKey: `${token}-idem`,
  nonce: `${token}-nonce-a`,
  issuedAt: 1_000,
  expiresAt: 61_000,
  cost: { paidCloudCredits: 0, providerCalls: 0 },
  ...overrides,
});
const result = (stored, overrides = {}) => ({
  ticketId: stored.ticketId,
  ticketVersion: stored.version,
  requestId: stored.requestId,
  workflowId: stored.workflowId,
  stepId: stored.stepId,
  nonce: stored.nonce,
  model: stored.allowedModels[0],
  runtime: 'WASM',
  accelerator: 'wasm',
  outputs: [{ uploadId: 'upload', kind: 'mask', role: 'MASK', sha256: 'b'.repeat(64), sizeBytes: 4, mimeType: 'application/octet-stream', width: 2, height: 2 }],
  metrics: { latencyMs: 10 },
  ...overrides,
});

const observation = (state, expiresAt = 61_000) => Object.freeze({
  kind: 'LOCAL_EXECUTION_TICKET',
  state,
  expiresAt: new Date(expiresAt).toISOString(),
  cancellation: 'UNSUPPORTED',
});

test('PostgreSQL local execution ledger is scope-isolated, durable, idempotent and serializes finalization across instances', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-local-ledger-integration' });
  const token = `local-ledger-${process.pid}-${Date.now()}`;
  const firstLedger = new PostgresLocalExecutionLedger(pool);
  const secondLedger = new PostgresLocalExecutionLedger(pool);
  try {
    const first = await firstLedger.issue(ticket(token));
    const replayCandidate = ticket(token, { ticketId: `${token}-ticket-b`, nonce: `${token}-nonce-b`, issuedAt: 2_000, expiresAt: 62_000 });
    const replay = await secondLedger.issue(replayCandidate);
    assert.equal(replay.ticketId, first.ticketId, 'same scoped idempotency binding must return the original durable ticket');
    assert.equal(replay.nonce, first.nonce, 'same scoped idempotency binding must preserve the original nonce');
    assert.deepEqual(await secondLedger.get(first.ticketId), first, 'another Core instance must read the same durable ticket');
    assert.equal((await secondLedger.getByIdempotencyKey(first.scope, first.idempotencyKey))?.ticketId, first.ticketId);
    assert.equal(await firstLedger.getFinalization(first.ticketId), undefined);
    assert.deepEqual(await secondLedger.observe(first.ticketId, first.scope, 2_500), observation('ACTIVE'));
    assert.deepEqual(await secondLedger.observe(first.ticketId, first.scope, 99_000), observation('EXPIRED'));
    assert.equal(await secondLedger.observe(first.ticketId, { ...first.scope, userId: `${token}-other-user` }, 2_500), undefined, 'cross-scope observation must be existence-safe');
    assert.equal(await secondLedger.observe(`${token}-missing-ticket`, first.scope, 2_500), undefined);
    await assert.rejects(() => secondLedger.observe(first.ticketId, first.scope, Number.NaN), /observation time must be finite/);

    const otherScope = scope(`${token}-other`);
    const sameClientIdOtherScope = await secondLedger.issue(ticket(token, {
      ticketId: `${token}-ticket-other-scope`,
      scope: otherScope,
      idempotencyKey: first.idempotencyKey,
      nonce: `${token}-other-nonce`,
    }));
    assert.equal(sameClientIdOtherScope.ticketId, `${token}-ticket-other-scope`, 'another canonical scope may reuse the same client idempotency key');
    assert.equal((await firstLedger.getByIdempotencyKey(otherScope, first.idempotencyKey))?.ticketId, sameClientIdOtherScope.ticketId);

    await assert.rejects(
      () => secondLedger.issue(ticket(token, { ticketId: `${token}-ticket-c`, workflowId: `${token}-other-workflow` })),
      /idempotency key already bound to another execution/,
    );

    const admitted = await firstLedger.claim({ ticketId: first.ticketId, result: result(first), callerScope: first.scope, now: 2_500 });
    assert.equal(admitted.allowed, true);
    assert.equal((await secondLedger.claim({ ticketId: first.ticketId, result: result(first), callerScope: first.scope, now: 2_501 })).reasonCode, 'IN_PROGRESS');

    await firstLedger.release(first.ticketId);
    const afterRelease = await secondLedger.claim({ ticketId: first.ticketId, result: result(first), callerScope: first.scope, now: 2_502 });
    assert.equal(afterRelease.allowed, true, 'released session advisory lock must make finalization retryable');
    await secondLedger.commit(first.ticketId, 'SUCCESS');

    assert.equal((await firstLedger.getFinalization(first.ticketId))?.status, 'SUCCESS');
    assert.equal((await secondLedger.getFinalization(first.ticketId))?.status, 'SUCCESS');
    assert.deepEqual(await firstLedger.observe(first.ticketId, first.scope, 99_000), observation('FINALIZED_SUCCESS'), 'terminal owner truth must take precedence over elapsed TTL');
    const replayBinding = await pool.query('SELECT admitted_result_sha256 FROM local_execution_tickets WHERE ticket_id=$1', [first.ticketId]);
    assert.match(replayBinding.rows[0]?.admitted_result_sha256 ?? '', /^[a-f0-9]{64}$/);
    assert.equal((await firstLedger.claim({ ticketId: first.ticketId, result: result(first), callerScope: first.scope, now: 99_000 })).reasonCode, 'REPLAYED_TICKET', 'exact replay remains idempotent after ticket expiry');
    assert.equal((await secondLedger.claim({ ticketId: first.ticketId, result: result(first, { metrics: { latencyMs: 11 } }), callerScope: first.scope, now: 99_001 })).reasonCode, 'CONFLICTING_REPLAY', 'valid but different replay payload must fail closed');

    await pool.query('UPDATE local_execution_tickets SET admitted_result_sha256=NULL WHERE ticket_id=$1', [first.ticketId]);
    assert.equal((await firstLedger.claim({ ticketId: first.ticketId, result: result(first), callerScope: first.scope, now: 99_002 })).reasonCode, 'CONFLICTING_REPLAY', 'legacy consumed rows without a replay digest cannot be treated as exact replay');

    const failed = await secondLedger.issue(ticket(`${token}-failed`, { issuedAt: 1_000, expiresAt: 61_000 }));
    const failedAdmission = await secondLedger.claim({ ticketId: failed.ticketId, result: result(failed), callerScope: failed.scope, now: 2_500 });
    assert.equal(failedAdmission.allowed, true);
    await secondLedger.commit(failed.ticketId, 'FAILED');
    assert.deepEqual(await firstLedger.observe(failed.ticketId, failed.scope, 99_000), observation('FINALIZED_FAILED'), 'failed finalization must remain distinct from expiry');

    const legacyUnknown = await secondLedger.issue(ticket(`${token}-legacy`, { issuedAt: 1_000, expiresAt: 61_000 }));
    await pool.query('UPDATE local_execution_tickets SET consumed_at=CURRENT_TIMESTAMP, finalized_status=NULL, finalized_at=NULL WHERE ticket_id=$1', [legacyUnknown.ticketId]);
    assert.deepEqual(await secondLedger.observe(legacyUnknown.ticketId, legacyUnknown.scope, 99_000), observation('FINALIZED_UNKNOWN'), 'legacy consumed rows remain explicit unknown authority truth');
  } finally {
    await firstLedger.release(`${token}-ticket-a`).catch(() => undefined);
    await secondLedger.release(`${token}-ticket-a`).catch(() => undefined);
    await pool.query("DELETE FROM local_execution_tickets WHERE idempotency_key LIKE $1", [`${token}%`]).catch(() => undefined);
    await pool.end();
  }
});
