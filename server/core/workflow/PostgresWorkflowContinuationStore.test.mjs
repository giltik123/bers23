import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresWorkflowContinuationStore } from './PostgresWorkflowContinuationStore.ts';

const NOW = Date.parse('2026-08-26T06:00:00.000Z');
const scope = token => Object.freeze({ tenantId: `${token}-tenant`, userId: `${token}-user`, projectId: `${token}-project` });
const createInput = token => Object.freeze({
  executionId: `${token}-execution`, clientRequestId: `${token}-request`, scope: scope(token),
  plan: Object.freeze({ planId: `${token}-plan`, planRevision: '1', planDigest: 'a'.repeat(64) }),
});
const ticket = (token, stepId = 'segment') => Object.freeze({
  stepId, ticketId: `${token}-${stepId}-ticket`, ticketVersion: '1', nonce: `${token}-${stepId}-nonce`,
  expiresAt: new Date(NOW + 60_000).toISOString(),
});

class FakePool {
  constructor() { this.rows = new Map(); this.tickets = new Map(); }
  async query(sql, params = []) { return this.#query(sql, params); }
  async connect() { return { query: (sql, params = []) => this.#query(sql, params), release() {} }; }
  addTicket(snapshot, binding, overrides = {}) {
    this.tickets.set(binding.ticketId, {
      ticket_id: binding.ticketId,
      tenant_id: snapshot.scope.tenantId, user_id: snapshot.scope.userId, project_id: snapshot.scope.projectId,
      workflow_id: snapshot.executionId, step_id: binding.stepId,
      ticket_json: { version: binding.ticketVersion, nonce: binding.nonce, expiresAt: Date.parse(binding.expiresAt), policy: 'LOCAL_ONLY', cost: { providerCalls: 0, paidCloudCredits: 0 } },
      consumed_at: null, finalized_status: null, ...overrides,
    });
  }
  finalize(ticketId, status = 'SUCCESS') { const row = this.tickets.get(ticketId); row.consumed_at = new Date(NOW + 10_000); row.finalized_status = status; }
  async #query(sql, params) {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{ pg_advisory_xact_lock: null }], rowCount: 1 };
    if (sql.includes('INSERT INTO workflow_continuations')) {
      const [executionId, clientRequestId, tenantId, userId, projectId, planId, planRevision, planDigest] = params;
      const conflict = [...this.rows.values()].find(row => row.execution_id === executionId || (row.tenant_id === tenantId && row.user_id === userId && row.project_id === projectId && row.client_request_id === clientRequestId));
      if (conflict) return { rows: [], rowCount: 0 };
      const at = new Date(NOW);
      const row = { execution_id: executionId, client_request_id: clientRequestId, tenant_id: tenantId, user_id: userId, project_id: projectId, plan_id: planId, plan_revision: planRevision, plan_digest: planDigest, state: 'READY', current_step_id: null, outstanding_ticket_id: null, outstanding_ticket_version: null, outstanding_ticket_nonce: null, outstanding_ticket_expires_at: null, completed_steps_json: [], terminal_artifact_id: null, failure_code: null, revision: '0', created_at: at, updated_at: at };
      this.rows.set(executionId, row); return { rows: [structuredClone(row)], rowCount: 1 };
    }
    if (sql.includes('FROM workflow_continuations') && sql.includes('client_request_id=$4')) {
      const [tenantId, userId, projectId, clientRequestId] = params;
      const row = [...this.rows.values()].find(value => value.tenant_id === tenantId && value.user_id === userId && value.project_id === projectId && value.client_request_id === clientRequestId);
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('FROM workflow_continuations') && sql.includes('execution_id=$1')) {
      const [executionId, tenantId, userId, projectId] = params;
      const row = this.rows.get(executionId);
      const matches = row && row.tenant_id === tenantId && row.user_id === userId && row.project_id === projectId;
      return { rows: matches ? [structuredClone(row)] : [], rowCount: matches ? 1 : 0 };
    }
    if (sql.includes('FROM local_execution_tickets') && sql.includes('ticket_json')) {
      const row = this.tickets.get(params[0]); return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('SELECT consumed_at,finalized_status FROM local_execution_tickets')) {
      const row = this.tickets.get(params[0]); return { rows: row ? [{ consumed_at: row.consumed_at, finalized_status: row.finalized_status }] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('UPDATE workflow_continuations SET')) {
      const [executionId, state, currentStepId, ticketId, ticketVersion, nonce, expiresAt, completedJson, terminalArtifactId, failureCode, expectedRevision] = params;
      const row = this.rows.get(executionId);
      if (!row || Number(row.revision) !== expectedRevision) return { rows: [], rowCount: 0 };
      Object.assign(row, { state, current_step_id: currentStepId, outstanding_ticket_id: ticketId, outstanding_ticket_version: ticketVersion, outstanding_ticket_nonce: nonce, outstanding_ticket_expires_at: expiresAt ? new Date(expiresAt) : null, completed_steps_json: JSON.parse(completedJson), terminal_artifact_id: terminalArtifactId, failure_code: failureCode, revision: String(expectedRevision + 1), updated_at: new Date(NOW + (expectedRevision + 1) * 1000) });
      return { rows: [structuredClone(row)], rowCount: 1 };
    }
    throw new Error(`FakePool received unexpected SQL: ${sql}`);
  }
}

test('continuation is scoped, durable across store instances, CAS-bound and replay-idempotent', async () => {
  const token = 'continuation-a'; const pool = new FakePool();
  const firstStore = new PostgresWorkflowContinuationStore(pool, () => NOW);
  const created = await firstStore.create(createInput(token));
  assert.equal(created.state, 'READY'); assert.equal(created.revision, 0);
  assert.equal(await firstStore.get(created.executionId, scope('other')), undefined, 'scope isolation must fail closed');
  assert.deepEqual(await firstStore.create(createInput(token)), created, 'exact scoped create replay must reconcile');
  await assert.rejects(() => firstStore.create({ ...createInput(token), executionId: `${token}-other-execution` }), /already bound to another workflow continuation/);

  const local = ticket(token);
  pool.addTicket(created, local);
  const waiting = await firstStore.waitForLocalResult({ executionId: created.executionId, scope: created.scope, expectedRevision: 0, ticket: local });
  assert.equal(waiting.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(waiting.revision, 1);
  assert.equal(waiting.outstandingLocal.ticketId, local.ticketId);

  const afterRestart = new PostgresWorkflowContinuationStore(pool, () => NOW);
  assert.deepEqual(await afterRestart.get(created.executionId, created.scope), waiting, 'new Core store instance must recover exact durable waiting state');
  assert.deepEqual(await afterRestart.waitForLocalResult({ executionId: created.executionId, scope: created.scope, expectedRevision: 0, ticket: local }), waiting, 'exact wait replay is idempotent even with stale caller revision');
  await assert.rejects(() => afterRestart.completeLocalStep({ executionId: created.executionId, scope: created.scope, expectedRevision: 1, stepId: local.stepId, ticketId: local.ticketId, artifactIds: ['mask-a'] }), /durably finalized SUCCESS/);

  pool.finalize(local.ticketId);
  const completed = await afterRestart.completeLocalStep({ executionId: created.executionId, scope: created.scope, expectedRevision: 1, stepId: local.stepId, ticketId: local.ticketId, artifactIds: ['mask-a'] });
  assert.equal(completed.state, 'READY'); assert.equal(completed.revision, 2); assert.equal(completed.completedSteps[0].artifactIds[0], 'mask-a');
  assert.deepEqual(await firstStore.completeLocalStep({ executionId: created.executionId, scope: created.scope, expectedRevision: 1, stepId: local.stepId, ticketId: local.ticketId, artifactIds: ['mask-a'] }), completed, 'exact local completion replay must return committed result');
  await assert.rejects(() => firstStore.completeLocalStep({ executionId: created.executionId, scope: created.scope, expectedRevision: 2, stepId: local.stepId, ticketId: local.ticketId, artifactIds: ['mask-b'] }), /different canonical result/);

  const running = await firstStore.runInternalStep({ executionId: created.executionId, scope: created.scope, expectedRevision: 2, stepId: 'verify' });
  assert.equal(running.state, 'RUNNING_INTERNAL'); assert.equal(running.revision, 3);
  const verified = await firstStore.completeInternalStep({ executionId: created.executionId, scope: created.scope, expectedRevision: 3, stepId: 'verify', artifactIds: ['mask-a'] });
  assert.equal(verified.state, 'READY'); assert.equal(verified.revision, 4);
  const success = await firstStore.succeed({ executionId: created.executionId, scope: created.scope, expectedRevision: 4, terminalArtifactId: 'mask-a' });
  assert.equal(success.state, 'SUCCESS'); assert.equal(success.revision, 5); assert.equal(success.terminalArtifactId, 'mask-a');
  assert.deepEqual(await afterRestart.succeed({ executionId: created.executionId, scope: created.scope, expectedRevision: 4, terminalArtifactId: 'mask-a' }), success);
  await assert.rejects(() => afterRestart.cancel({ executionId: created.executionId, scope: created.scope, expectedRevision: 5 }), /Terminal workflow continuation SUCCESS cannot advance/);
});

test('foreign, paid, expired and late local work cannot advance a continuation', async () => {
  const token = 'continuation-b'; const pool = new FakePool(); const store = new PostgresWorkflowContinuationStore(pool, () => NOW);
  const created = await store.create(createInput(token));

  const paid = ticket(`${token}-paid`); pool.addTicket(created, paid, { workflow_id: created.executionId, step_id: paid.stepId, ticket_json: { version: '1', nonce: paid.nonce, expiresAt: Date.parse(paid.expiresAt), policy: 'LOCAL_ONLY', cost: { providerCalls: 1, paidCloudCredits: 0 } } });
  await assert.rejects(() => store.waitForLocalResult({ executionId: created.executionId, scope: created.scope, expectedRevision: 0, ticket: paid }), /forbidden provider or paid-credit authority/);

  const foreign = ticket(`${token}-foreign`); pool.addTicket(created, foreign, { workflow_id: 'other-workflow', step_id: foreign.stepId });
  await assert.rejects(() => store.waitForLocalResult({ executionId: created.executionId, scope: created.scope, expectedRevision: 0, ticket: foreign }), /scope\/workflow\/step binding/);

  const expired = Object.freeze({ ...ticket(`${token}-expired`), expiresAt: new Date(NOW - 1).toISOString() }); pool.addTicket(created, expired);
  await assert.rejects(() => store.waitForLocalResult({ executionId: created.executionId, scope: created.scope, expectedRevision: 0, ticket: expired }), /Expired local execution ticket/);

  const valid = ticket(token, 'background-isolation'); pool.addTicket(created, valid);
  const waiting = await store.waitForLocalResult({ executionId: created.executionId, scope: created.scope, expectedRevision: 0, ticket: valid });
  const cancelled = await store.cancel({ executionId: created.executionId, scope: created.scope, expectedRevision: waiting.revision });
  assert.equal(cancelled.state, 'CANCELLED');
  pool.finalize(valid.ticketId);
  await assert.rejects(() => store.completeLocalStep({ executionId: created.executionId, scope: created.scope, expectedRevision: cancelled.revision, stepId: valid.stepId, ticketId: valid.ticketId, artifactIds: ['late-artifact'] }), /Terminal workflow continuation CANCELLED cannot advance/);
});
