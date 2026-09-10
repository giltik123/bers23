import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresWorkflowContinuationStore } from './PostgresWorkflowContinuationStore.ts';

const NOW = Date.parse('2026-09-10T00:00:00.000Z');
const scope = Object.freeze({ tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' });
const input = Object.freeze({
  artifactId: 'source-a', kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64), parentArtifactIds: Object.freeze([]),
});
const createInput = Object.freeze({
  executionId: 'workflow-a', clientRequestId: 'request-a', scope,
  plan: Object.freeze({ planId: 'aee-admitted-plan-v1', planRevision: '1', planDigest: 'b'.repeat(64) }),
  inputArtifacts: Object.freeze([input]),
});

function ticket(name, stepId, expiresAt = NOW + 60_000) {
  return Object.freeze({
    stepId,
    ticketId: `${name}-ticket`,
    ticketVersion: '2',
    nonce: `${name}-nonce`,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

class FakePool {
  constructor() {
    this.row = undefined;
    this.tickets = new Map();
  }

  async query(sql, params = []) { return this.#query(sql, params); }
  async connect() { return { query: (sql, params = []) => this.#query(sql, params), release() {} }; }

  addTicket(binding, stepId = binding.stepId) {
    this.tickets.set(binding.ticketId, {
      ticket_id: binding.ticketId,
      tenant_id: scope.tenantId,
      user_id: scope.userId,
      project_id: scope.projectId,
      workflow_id: createInput.executionId,
      step_id: stepId,
      ticket_json: {
        version: binding.ticketVersion,
        nonce: binding.nonce,
        expiresAt: Date.parse(binding.expiresAt),
        policy: 'LOCAL_ONLY',
        cost: { providerCalls: 0, paidCloudCredits: 0 },
        inputs: [{ artifactId: input.artifactId, kind: input.kind, role: input.role, sha256: input.sha256 }],
      },
      consumed_at: null,
      finalized_status: null,
    });
  }

  finalize(ticketId, status = 'SUCCESS') {
    const row = this.tickets.get(ticketId);
    row.consumed_at = new Date(NOW + 5_000);
    row.finalized_status = status;
  }

  async #query(sql, params) {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{ pg_advisory_xact_lock: null }], rowCount: 1 };

    if (sql.includes('INSERT INTO workflow_continuations')) {
      if (this.row) return { rows: [], rowCount: 0 };
      const [executionId, clientRequestId, tenantId, userId, projectId, planId, planRevision, planDigest, inputArtifactsJson, planParametersJson] = params;
      const at = new Date(NOW);
      this.row = {
        execution_id: executionId,
        client_request_id: clientRequestId,
        tenant_id: tenantId,
        user_id: userId,
        project_id: projectId,
        plan_id: planId,
        plan_revision: planRevision,
        plan_digest: planDigest,
        plan_parameters_json: JSON.parse(planParametersJson),
        input_artifacts_json: JSON.parse(inputArtifactsJson),
        state: 'READY',
        current_step_id: null,
        outstanding_ticket_id: null,
        outstanding_ticket_version: null,
        outstanding_ticket_nonce: null,
        outstanding_ticket_expires_at: null,
        completed_steps_json: [],
        terminal_artifact_id: null,
        failure_code: null,
        revision: '0',
        created_at: at,
        updated_at: at,
      };
      return { rows: [structuredClone(this.row)], rowCount: 1 };
    }

    if (sql.includes('FROM workflow_continuations') && sql.includes('execution_id=$1')) {
      const [executionId, tenantId, userId, projectId] = params;
      const matches = this.row && this.row.execution_id === executionId && this.row.tenant_id === tenantId && this.row.user_id === userId && this.row.project_id === projectId;
      return { rows: matches ? [structuredClone(this.row)] : [], rowCount: matches ? 1 : 0 };
    }

    if (sql.includes('FROM workflow_continuations') && sql.includes('client_request_id=$4')) {
      const [tenantId, userId, projectId, clientRequestId] = params;
      const matches = this.row && this.row.tenant_id === tenantId && this.row.user_id === userId && this.row.project_id === projectId && this.row.client_request_id === clientRequestId;
      return { rows: matches ? [structuredClone(this.row)] : [], rowCount: matches ? 1 : 0 };
    }

    if (sql.includes('FROM local_execution_tickets') && sql.includes('ticket_json')) {
      const row = this.tickets.get(params[0]);
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }

    if (sql.includes('SELECT consumed_at,finalized_status FROM local_execution_tickets')) {
      const row = this.tickets.get(params[0]);
      return { rows: row ? [{ consumed_at: row.consumed_at, finalized_status: row.finalized_status }] : [], rowCount: row ? 1 : 0 };
    }

    if (sql.includes('UPDATE workflow_continuations SET')) {
      const [executionId, state, currentStepId, ticketId, ticketVersion, nonce, expiresAt, completedJson, terminalArtifactId, failureCode, expectedRevision] = params;
      if (!this.row || this.row.execution_id !== executionId || Number(this.row.revision) !== expectedRevision) return { rows: [], rowCount: 0 };
      Object.assign(this.row, {
        state,
        current_step_id: currentStepId,
        outstanding_ticket_id: ticketId,
        outstanding_ticket_version: ticketVersion,
        outstanding_ticket_nonce: nonce,
        outstanding_ticket_expires_at: expiresAt ? new Date(expiresAt) : null,
        completed_steps_json: JSON.parse(completedJson),
        terminal_artifact_id: terminalArtifactId,
        failure_code: failureCode,
        revision: String(expectedRevision + 1),
        updated_at: new Date(NOW + (expectedRevision + 1) * 1_000),
      });
      return { rows: [structuredClone(this.row)], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

test('logical continuation node identity is independent from local ticket operation identity', async () => {
  const pool = new FakePool();
  const initial = new PostgresWorkflowContinuationStore(pool, () => NOW);
  const created = await initial.create(createInput);

  const first = ticket('resize-attempt-1', 'resize', NOW + 1_000);
  pool.addTicket(first);
  const waiting = await initial.waitForLocalResult({
    executionId: created.executionId,
    scope,
    expectedRevision: created.revision,
    continuationStepId: 'resize-second',
    ticket: first,
  });
  assert.equal(waiting.currentStepId, 'resize-second');
  assert.equal(waiting.outstandingLocal.stepId, 'resize-second');
  assert.equal(pool.tickets.get(first.ticketId).step_id, 'resize');

  const restarted = new PostgresWorkflowContinuationStore(pool, () => NOW + 2_000);
  assert.deepEqual(await restarted.get(created.executionId, scope), waiting, 'restart must retain logical node identity without copying operation identity');

  const replacement = ticket('resize-attempt-2', 'resize');
  pool.addTicket(replacement);
  const retried = await restarted.retryLocalResult({
    executionId: created.executionId,
    scope,
    expectedRevision: waiting.revision,
    continuationStepId: 'resize-second',
    previousTicketId: first.ticketId,
    ticket: replacement,
  });
  assert.equal(retried.currentStepId, 'resize-second');
  assert.equal(retried.outstandingLocal.stepId, 'resize-second');
  assert.equal(retried.outstandingLocal.ticketId, replacement.ticketId);

  const wrongOperation = ticket('wrong-operation', 'orthogonal-transform');
  pool.addTicket(wrongOperation);
  pool.finalize(replacement.ticketId, 'FAILED');
  await assert.rejects(
    () => restarted.retryLocalResult({
      executionId: created.executionId,
      scope,
      expectedRevision: retried.revision,
      continuationStepId: 'resize-second',
      previousTicketId: replacement.ticketId,
      ticket: wrongOperation,
    }),
    /cannot change the underlying local operation step/,
  );

  pool.finalize(replacement.ticketId, 'SUCCESS');
  const completed = await restarted.completeLocalStep({
    executionId: created.executionId,
    scope,
    expectedRevision: retried.revision,
    stepId: 'resize-second',
    ticketId: replacement.ticketId,
    artifactIds: ['final-resize-two'],
  });
  assert.equal(completed.state, 'READY');
  assert.deepEqual(completed.completedSteps, [{ stepId: 'resize-second', ticketId: replacement.ticketId, artifactIds: ['final-resize-two'] }]);
});
