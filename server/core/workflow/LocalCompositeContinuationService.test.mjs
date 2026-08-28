import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalExecutionAdmissionRegistry } from '../localExecution/LocalExecutionAdmission.ts';
import { LocalExecutionTicketAuthority } from '../localExecution/LocalExecutionTicketAuthority.ts';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';
import { LocalCompositeContinuationService, LOCAL_COMPOSITE_CONTINUATION_STEPS } from './LocalCompositeContinuationService.ts';

const scope = Object.freeze({ tenantId: 'tenant', userId: 'user', projectId: 'project' });
const root = Object.freeze({ artifactId: 'root-image', kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64), parentArtifactIds: Object.freeze([]), width: 2, height: 2 });
const command = Object.freeze({
  clientRequestId: 'client-1', inputArtifactId: root.artifactId,
  analysis: Object.freeze({ originalWidth: 2, originalHeight: 2, analysisWidth: 2, analysisHeight: 2, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }),
  points: Object.freeze([Object.freeze({ x: 0, y: 0, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' })]),
});

class MemoryContinuationStore {
  constructor() { this.rows = new Map(); this.failCreateOnce = false; }
  async create(input) {
    if (this.failCreateOnce) { this.failCreateOnce = false; throw Object.assign(new Error('synthetic crash after ticket issue'), { code: 'SYNTHETIC_CRASH' }); }
    const existing = this.rows.get(input.executionId) ?? [...this.rows.values()].find(row => sameScope(row.scope, input.scope) && row.clientRequestId === input.clientRequestId);
    if (existing) {
      if (existing.executionId !== input.executionId || JSON.stringify(existing.plan) !== JSON.stringify(input.plan) || JSON.stringify(existing.inputArtifacts) !== JSON.stringify(input.inputArtifacts)) throw Object.assign(new Error('Scoped client request id is already bound to another workflow continuation'), { code: 'WORKFLOW_CONTINUATION_CONFLICT' });
      return existing;
    }
    const snapshot = freeze({ ...input, state: 'READY', completedSteps: [], revision: 0, createdAt: '2026-08-26T00:00:00.000Z', updatedAt: '2026-08-26T00:00:00.000Z' });
    this.rows.set(snapshot.executionId, snapshot); return snapshot;
  }
  async get(executionId, scoped) { const row = this.rows.get(executionId); return row && sameScope(row.scope, scoped) ? row : undefined; }
  async getByClientRequestId(scoped, clientRequestId) { return [...this.rows.values()].find(row => sameScope(row.scope, scoped) && row.clientRequestId === clientRequestId); }
  async waitForLocalResult(input) {
    const row = this.must(input.executionId, input.scope);
    if (row.state === 'WAITING_FOR_LOCAL_RESULT' && row.outstandingLocal?.ticketId === input.ticket.ticketId) return row;
    assert.equal(row.state, 'READY'); assert.equal(row.revision, input.expectedRevision);
    return this.write(row, { state: 'WAITING_FOR_LOCAL_RESULT', currentStepId: input.ticket.stepId, outstandingLocal: input.ticket, completedSteps: row.completedSteps });
  }
  async completeLocalStep(input) {
    const row = this.must(input.executionId, input.scope); const prior = row.completedSteps.find(step => step.stepId === input.stepId);
    if (prior) { assert.equal(prior.ticketId, input.ticketId); assert.deepEqual(prior.artifactIds, input.artifactIds); return row; }
    assert.equal(row.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(row.currentStepId, input.stepId); assert.equal(row.outstandingLocal.ticketId, input.ticketId); assert.equal(row.revision, input.expectedRevision);
    return this.write(row, { state: 'READY', completedSteps: [...row.completedSteps, freeze({ stepId: input.stepId, ticketId: input.ticketId, artifactIds: [...input.artifactIds] })] });
  }
  async runInternalStep(input) { const row = this.must(input.executionId, input.scope); if (row.state === 'RUNNING_INTERNAL' && row.currentStepId === input.stepId) return row; assert.equal(row.state, 'READY'); assert.equal(row.revision, input.expectedRevision); return this.write(row, { state: 'RUNNING_INTERNAL', currentStepId: input.stepId, completedSteps: row.completedSteps }); }
  async completeInternalStep(input) { const row = this.must(input.executionId, input.scope); const prior = row.completedSteps.find(step => step.stepId === input.stepId); if (prior) return row; assert.equal(row.state, 'RUNNING_INTERNAL'); assert.equal(row.currentStepId, input.stepId); assert.equal(row.revision, input.expectedRevision); return this.write(row, { state: 'READY', completedSteps: [...row.completedSteps, freeze({ stepId: input.stepId, artifactIds: [...input.artifactIds] })] }); }
  async succeed(input) { const row = this.must(input.executionId, input.scope); if (row.state === 'SUCCESS' && row.terminalArtifactId === input.terminalArtifactId) return row; assert.equal(row.state, 'READY'); assert.equal(row.revision, input.expectedRevision); assert.ok(row.completedSteps.at(-1).artifactIds.includes(input.terminalArtifactId)); return this.write(row, { state: 'SUCCESS', completedSteps: row.completedSteps, terminalArtifactId: input.terminalArtifactId }); }
  async fail(input) { return this.terminal(input, 'FAILED', input.failureCode); }
  async cancel(input) { return this.terminal(input, 'CANCELLED', 'WORKFLOW_CANCELLED'); }
  async markUnknown(input) { return this.terminal(input, 'UNKNOWN', input.failureCode); }
  async terminal(input, state, failureCode) {
    const row = this.must(input.executionId, input.scope);
    if (row.state === state && row.failureCode === failureCode) return row;
    assert.equal(row.revision, input.expectedRevision);
    return this.write(row, { state, completedSteps: row.completedSteps, failureCode });
  }
  must(executionId, scoped) { const row = this.rows.get(executionId); assert.ok(row); assert.ok(sameScope(row.scope, scoped)); return row; }
  write(row, patch) { const next = freeze({ ...row, currentStepId: undefined, outstandingLocal: undefined, terminalArtifactId: undefined, failureCode: undefined, ...patch, revision: row.revision + 1, updatedAt: '2026-08-26T00:00:01.000Z' }); this.rows.set(row.executionId, next); return next; }
}

function fixture() {
  const continuations = new MemoryContinuationStore();
  const ledger = new LocalExecutionAdmissionRegistry();
  const clock = { now: 1_000 };
  const controls = { segmentStatus: 'SUCCESS', isolationStatus: 'SUCCESS' };
  const finalized = new Map();
  let sequence = 0;
  const ticketAuthority = new LocalExecutionTicketAuthority(ledger, {
    now: () => clock.now, id: () => `ticket-${++sequence}`, nonce: () => `nonce-${sequence}`, ttlMs: 60_000,
    modelsByCapability: { [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment]: [Object.freeze({ modelId: 'test-mobilesam', version: '1' })] },
    executorsByCapability: { [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation]: [Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: '1' })] },
  });
  const artifacts = new Map([[root.artifactId, root]]);
  const calls = { segment: 0, isolation: 0, verify: 0 };
  const service = new LocalCompositeContinuationService({
    continuations, tickets: ledger, v1Tickets: ticketAuthority, v2Tickets: ticketAuthority,
    artifacts: { resolve: async (_scope, artifactId) => { const value = artifacts.get(artifactId); if (!value) throw new Error(`missing artifact ${artifactId}`); return value; } },
    segmentResults: { submit: async () => {
      calls.segment++;
      if (controls.segmentStatus !== 'SUCCESS') return freeze({ status: controls.segmentStatus });
      const value = freeze({ artifactId: 'mask-1', kind: 'mask', role: 'MASK', sha256: 'b'.repeat(64), parentArtifactIds: [root.artifactId], width: 2, height: 2 });
      artifacts.set(value.artifactId, value);
      return freeze({ status: 'SUCCESS', artifactId: value.artifactId });
    } },
    backgroundIsolationResults: { submit: async ({ ticket }) => {
      calls.isolation++;
      if (controls.isolationStatus !== 'SUCCESS') return freeze({ status: controls.isolationStatus });
      assert.equal(ticket.inputs.some(input => input.artifactId === 'mask-1'), true);
      const value = freeze({ artifactId: 'composite-1', kind: 'image', role: 'COMPOSITE', sha256: 'c'.repeat(64), parentArtifactIds: [root.artifactId, 'mask-1'], width: 2, height: 2 });
      artifacts.set(value.artifactId, value);
      return freeze({ status: 'SUCCESS', artifactId: value.artifactId });
    } },
    finalizedResults: { recover: async (ticket) => finalized.get(ticket.ticketId) },
    internalVerifier: { verify: async ({ stepId, artifactId }) => { calls.verify++; assert.equal(stepId, LOCAL_COMPOSITE_CONTINUATION_STEPS.verify); assert.equal(artifactId, 'composite-1'); } },
    now: () => clock.now,
  });
  return { service, continuations, ledger, calls, clock, controls, finalized, artifacts };
}

test('ticket-first start survives a crash before continuation creation and reuses the durable segment ticket', async () => {
  const { service, continuations, ledger } = fixture();
  continuations.failCreateOnce = true;
  await assert.rejects(() => service.start(command, scope), /synthetic crash/);
  const durable = await ledger.getByIdempotencyKey(scope, `c5b:${command.clientRequestId}:${LOCAL_COMPOSITE_CONTINUATION_STEPS.segment}:v1`);
  assert.ok(durable, 'segment ticket must exist before continuation write');
  const recovered = await service.start(command, scope);
  assert.equal(recovered.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(recovered.nextAction.ticket.ticketId, durable.ticketId, 'retry must reuse exact durable ticket instead of minting a second authority');
});

test('Core alone selects segment -> background isolation -> internal verify and rejects step skipping', async () => {
  const { service, calls } = fixture();
  let view = await service.start(command, scope);
  assert.equal(view.nextAction.type, 'LOCAL_EXECUTION');
  assert.equal(view.nextAction.ticket.stepId, LOCAL_COMPOSITE_CONTINUATION_STEPS.segment);
  assert.equal(view.nextAction.ticket.operation.capability, LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment);

  await assert.rejects(() => service.submitLocalResult(view.executionId, scope, { ticketId: 'forged-background-ticket' }), /not the Core-selected outstanding workflow step/);
  assert.deepEqual(calls, { segment: 0, isolation: 0, verify: 0 });

  const segmentTicket = view.nextAction.ticket;
  view = await service.submitLocalResult(view.executionId, scope, { ticketId: segmentTicket.ticketId, stepId: 'client-forged-step-choice' });
  assert.equal(calls.segment, 1);
  assert.equal(view.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(view.nextAction.ticket.stepId, LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation);
  assert.equal(view.nextAction.ticket.operation.capability, LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation);
  assert.deepEqual(view.nextAction.ticket.inputs.map(input => input.artifactId).sort(), ['mask-1', root.artifactId].sort());

  const replay = await service.submitLocalResult(view.executionId, scope, { ticketId: segmentTicket.ticketId });
  assert.equal(replay.nextAction.ticket.ticketId, view.nextAction.ticket.ticketId, 'completed local replay must not change the Core-selected next step');
  assert.equal(calls.segment, 2);

  const isolationTicket = view.nextAction.ticket;
  view = await service.submitLocalResult(view.executionId, scope, { ticketId: isolationTicket.ticketId, stepId: LOCAL_COMPOSITE_CONTINUATION_STEPS.segment });
  assert.equal(view.state, 'SUCCESS');
  assert.equal(view.terminalArtifactId, 'composite-1');
  assert.deepEqual(calls, { segment: 2, isolation: 1, verify: 1 });

  const resumed = await service.resume(view.executionId, scope);
  assert.equal(resumed.state, 'SUCCESS'); assert.equal(resumed.terminalArtifactId, 'composite-1');
  const idempotentStart = await service.start(command, scope);
  assert.equal(idempotentStart.state, 'SUCCESS');
  await assert.rejects(() => service.start({ ...command, points: [{ x: 1, y: 1, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' }] }, scope), /already bound to another workflow continuation/);
});

test('resume binds already-finalized SUCCESS artifacts without reissuing completed local work', async () => {
  const { service, finalized, artifacts, calls } = fixture();
  let view = await service.start(command, scope);
  const segmentTicket = view.nextAction.ticket;
  const mask = freeze({ artifactId: 'mask-1', kind: 'mask', role: 'MASK', sha256: 'b'.repeat(64), parentArtifactIds: [root.artifactId], width: 2, height: 2 });
  artifacts.set(mask.artifactId, mask);
  finalized.set(segmentTicket.ticketId, freeze({ status: 'SUCCESS', artifactId: mask.artifactId }));

  view = await service.resume(view.executionId, scope);
  assert.equal(view.state, 'WAITING_FOR_LOCAL_RESULT');
  assert.equal(view.nextAction.ticket.stepId, LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation);
  assert.equal(calls.segment, 0, 'durably finalized segment must be rebound without browser/local re-execution');
  const backgroundTicket = view.nextAction.ticket;

  const composite = freeze({ artifactId: 'composite-1', kind: 'image', role: 'COMPOSITE', sha256: 'c'.repeat(64), parentArtifactIds: [root.artifactId, mask.artifactId], width: 2, height: 2 });
  artifacts.set(composite.artifactId, composite);
  finalized.set(backgroundTicket.ticketId, freeze({ status: 'SUCCESS', artifactId: composite.artifactId }));
  view = await service.resume(view.executionId, scope);
  assert.equal(view.state, 'SUCCESS');
  assert.equal(view.terminalArtifactId, composite.artifactId);
  assert.deepEqual(calls, { segment: 0, isolation: 0, verify: 1 }, 'both local steps recover from durable finalization; only server-owned INTERNAL verify executes');
});

test('durably finalized FAILED or UNKNOWN local ticket becomes terminal and is never returned as executable nextAction', async t => {
  for (const terminal of ['FAILED', 'UNKNOWN']) {
    await t.test(terminal, async () => {
      const { service, finalized, calls } = fixture();
      const waiting = await service.start(command, scope);
      finalized.set(waiting.nextAction.ticket.ticketId, freeze({ status: terminal }));
      const recovered = await service.resume(waiting.executionId, scope);
      assert.equal(recovered.state, terminal);
      assert.equal(recovered.nextAction, undefined);
      assert.equal(recovered.failureCode, terminal === 'FAILED' ? 'LOCAL_SEGMENTATION_FAILED' : 'LOCAL_SEGMENTATION_UNKNOWN');
      assert.deepEqual(calls, { segment: 0, isolation: 0, verify: 0 });
    });
  }
});

test('a newly returned FAILED local result transitions continuation terminal before any next step is authorized', async () => {
  const { service, controls, calls } = fixture();
  const waiting = await service.start(command, scope);
  controls.segmentStatus = 'FAILED';
  const failed = await service.submitLocalResult(waiting.executionId, scope, { ticketId: waiting.nextAction.ticket.ticketId });
  assert.equal(failed.state, 'FAILED');
  assert.equal(failed.failureCode, 'LOCAL_SEGMENTATION_FAILED');
  assert.equal(failed.nextAction, undefined);
  assert.deepEqual(calls, { segment: 1, isolation: 0, verify: 0 });
});

test('expired outstanding work and durable ticket-binding drift fail closed before result authority', async () => {
  const { service, continuations, calls, clock } = fixture();
  const view = await service.start(command, scope);
  const ticket = view.nextAction.ticket;

  clock.now = ticket.expiresAt;
  await assert.rejects(
    () => service.resume(view.executionId, scope),
    error => error?.status === 410 && error?.code === 'local_composite_ticket_expired',
  );
  await assert.rejects(
    () => service.submitLocalResult(view.executionId, scope, { ticketId: ticket.ticketId }),
    error => error?.status === 410 && error?.code === 'local_composite_ticket_expired',
  );
  assert.deepEqual(calls, { segment: 0, isolation: 0, verify: 0 });

  clock.now = 1_000;
  const snapshot = continuations.must(view.executionId, scope);
  continuations.rows.set(view.executionId, freeze({
    ...snapshot,
    outstandingLocal: { ...snapshot.outstandingLocal, nonce: 'drifted-durable-nonce' },
  }));
  await assert.rejects(
    () => service.resume(view.executionId, scope),
    error => error?.status === 409 && error?.code === 'local_composite_ticket_binding_mismatch',
  );
  assert.deepEqual(calls, { segment: 0, isolation: 0, verify: 0 });
});

test('FAILED, UNKNOWN and CANCELLED are terminal and a late local result cannot resurrect cancelled work', async t => {
  for (const state of ['FAILED', 'UNKNOWN', 'CANCELLED']) {
    await t.test(state, async () => {
      const { service, continuations, calls } = fixture();
      const waiting = await service.start(command, scope);
      const row = continuations.must(waiting.executionId, scope);
      if (state === 'FAILED') await continuations.fail({ executionId: waiting.executionId, scope, expectedRevision: row.revision, failureCode: 'TEST_FAILURE' });
      else if (state === 'UNKNOWN') await continuations.markUnknown({ executionId: waiting.executionId, scope, expectedRevision: row.revision, failureCode: 'TEST_UNKNOWN' });
      else await continuations.cancel({ executionId: waiting.executionId, scope, expectedRevision: row.revision });

      const terminal = await service.resume(waiting.executionId, scope);
      assert.equal(terminal.state, state);
      assert.equal(terminal.nextAction, undefined);
      await assert.rejects(
        () => service.submitLocalResult(waiting.executionId, scope, { ticketId: waiting.nextAction.ticket.ticketId }),
        error => error?.status === 409 && error?.code === 'local_composite_result_not_outstanding',
      );
      const afterLateResult = await service.resume(waiting.executionId, scope);
      assert.equal(afterLateResult.state, state);
      assert.deepEqual(calls, { segment: 0, isolation: 0, verify: 0 });
    });
  }
});

function sameScope(a, b) { return a.tenantId === b.tenantId && a.userId === b.userId && a.projectId === b.projectId; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
