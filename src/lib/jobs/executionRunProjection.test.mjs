import assert from 'node:assert/strict';
import test from 'node:test';
import { ExecutionRunProjection, executionRunCapabilityLabel, executionRunStatusLabel, localExecutionAuthorityStateLabel } from './executionRunProjection.js';

const projectA = '11111111-1111-4111-8111-111111111111';
const projectB = '22222222-2222-4222-8222-222222222222';
const workflowId = '33333333-3333-4333-8333-333333333333';
const localId = '44444444-4444-4444-8444-444444444444';
const internalId = '55555555-5555-4555-8555-555555555555';
const creativeId = '66666666-6666-4666-8666-666666666666';
const now = '2026-09-06T07:00:00.000Z';

function run(overrides = {}) {
  const capability = overrides.capability || 'CREATIVE_EXECUTION';
  const authorityKind = ({
    CREATIVE_EXECUTION: 'CREATIVE_EXECUTION',
    LOCAL_EXECUTION: 'LOCAL_EXECUTION_TICKET',
    WORKFLOW_CONTINUATION: 'WORKFLOW_CONTINUATION',
    WORKFLOW_STEP: 'WORKFLOW_INTERNAL_STEP',
  })[capability];
  return Object.freeze({
    runId: creativeId,
    capability,
    authorityKind,
    authorityRef: `authority:${overrides.runId || creativeId}`,
    status: 'RUNNING',
    revision: 2,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    ...overrides,
  });
}

function localAuthority(state, overrides = {}) {
  return Object.freeze({
    kind: 'LOCAL_EXECUTION_TICKET',
    state,
    expiresAt: '2026-09-06T07:02:00.000Z',
    cancellation: 'UNSUPPORTED',
    ...overrides,
  });
}

function projection(client, options = {}) {
  let scheduled = 0;
  let cancelled = 0;
  const value = new ExecutionRunProjection({
    client,
    pollIntervalMs: 15000,
    schedule: () => { scheduled += 1; return `timer-${scheduled}`; },
    cancelSchedule: () => { cancelled += 1; },
    now: () => '2026-09-06T07:05:00.000Z',
    ...options,
  });
  return { value, counters: () => ({ scheduled, cancelled }) };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test('projection recovers canonical roots plus direct workflow children and preserves UNKNOWN as distinct terminal truth', async () => {
  const workflow = run({ runId: workflowId, capability: 'WORKFLOW_CONTINUATION', authorityRef: 'workflow:1' });
  const unknownCreative = run({ runId: creativeId, status: 'UNKNOWN', revision: 3, statusReasonCode: 'PROVIDER_OUTCOME_UNKNOWN', finishedAt: now });
  const local = run({
    runId: localId,
    parentRunId: workflowId,
    capability: 'LOCAL_EXECUTION',
    authorityRef: 'ticket:1',
    status: 'SUCCEEDED',
    revision: 3,
    finishedAt: now,
    localExecution: localAuthority('FINALIZED_SUCCESS'),
  });
  const internal = run({ runId: internalId, parentRunId: workflowId, capability: 'WORKFLOW_STEP', authorityRef: 'workflow-internal-step:1:verify', status: 'FAILED', revision: 3, statusReasonCode: 'VERIFY_FAILED', finishedAt: now });
  const calls = [];
  const client = Object.freeze({
    listRoots: async (projectId, limit) => { calls.push(['roots', projectId, limit]); return { runs: [workflow, unknownCreative] }; },
    get: async () => undefined,
    listChildren: async (runId, projectId, limit) => {
      calls.push(['children', runId, projectId, limit]);
      return { parent: run({ ...workflow, revision: 3, updatedAt: '2026-09-06T07:01:00.000Z' }), runs: [local, internal] };
    },
  });
  const { value } = projection(client);

  assert.equal(await value.start(projectA), true);
  const state = value.snapshot();
  assert.equal(state.authoritative, true);
  assert.equal(state.stale, false);
  assert.equal(state.loading, false);
  assert.equal(state.lastRefreshedAt, '2026-09-06T07:05:00.000Z');
  assert.deepEqual(calls, [
    ['roots', projectA, 10],
    ['children', workflowId, projectA, 25],
  ]);
  assert.equal(state.runs.length, 2);
  assert.equal(state.runs[0].runId, workflowId);
  assert.equal(state.runs[0].revision, 3);
  assert.deepEqual(state.runs[0].children.map((child) => [child.runId, child.status]), [[localId, 'SUCCEEDED'], [internalId, 'FAILED']]);
  assert.deepEqual(state.runs[0].children[0].localExecution, localAuthority('FINALIZED_SUCCESS'));
  assert.equal(state.runs[1].status, 'UNKNOWN');
  assert.equal(state.runs[1].statusReasonCode, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.notEqual(state.runs[1].status, 'FAILED');
  assert.equal(executionRunStatusLabel('UNKNOWN'), 'Unknown');
  assert.equal(executionRunCapabilityLabel('WORKFLOW_CONTINUATION'), 'Composite workflow');
  assert.equal(localExecutionAuthorityStateLabel('FINALIZED_SUCCESS'), 'Ticket finalized: success');
});

test('RUNNING Local Execution can truthfully project EXPIRED owner authority without fabricating terminal lifecycle', async () => {
  const workflow = run({ runId: workflowId, capability: 'WORKFLOW_CONTINUATION', authorityRef: 'workflow:local-expiry' });
  const expired = run({
    runId: localId,
    parentRunId: workflowId,
    capability: 'LOCAL_EXECUTION',
    authorityRef: 'ticket:expired',
    status: 'RUNNING',
    revision: 2,
    localExecution: localAuthority('EXPIRED'),
  });
  const client = Object.freeze({
    listRoots: async () => ({ runs: [workflow] }),
    get: async () => undefined,
    listChildren: async () => ({ parent: workflow, runs: [expired] }),
  });
  const { value } = projection(client);

  assert.equal(await value.start(projectA), true);
  const child = value.snapshot().runs[0].children[0];
  assert.equal(child.status, 'RUNNING');
  assert.equal(child.localExecution.state, 'EXPIRED');
  assert.equal(child.localExecution.cancellation, 'UNSUPPORTED');
  assert.equal(localExecutionAuthorityStateLabel(child.localExecution.state), 'Ticket expired');
});

test('Local authority descriptors are accepted only for exact LOCAL_EXECUTION_TICKET authority and fail closed on widening', async () => {
  const cases = [
    run({ localExecution: localAuthority('ACTIVE') }),
    run({ capability: 'LOCAL_EXECUTION', runId: localId, authorityRef: 'ticket:bad-state', localExecution: localAuthority('CANCELLED') }),
    run({ capability: 'LOCAL_EXECUTION', runId: localId, authorityRef: 'ticket:bad-cancel', localExecution: localAuthority('ACTIVE', { cancellation: 'AVAILABLE' }) }),
    run({ capability: 'LOCAL_EXECUTION', runId: localId, authorityRef: 'ticket:bad-time', localExecution: localAuthority('ACTIVE', { expiresAt: 'not-a-time' }) }),
  ];
  for (const candidate of cases) {
    const client = Object.freeze({
      listRoots: async () => ({ runs: [candidate] }),
      get: async () => undefined,
      listChildren: async () => ({ parent: null, runs: [] }),
    });
    const { value } = projection(client);
    assert.equal(await value.start(projectA), false);
    assert.equal(value.snapshot().authoritative, false);
    assert.equal(value.snapshot().runs.length, 0);
    assert.equal(value.snapshot().error.code, 'execution_run_recovery_unavailable');
  }
});

test('project switch rejects an older in-flight response and never exposes cross-project stale data', async () => {
  const pendingA = deferred();
  const pendingB = deferred();
  const calls = [];
  const client = Object.freeze({
    listRoots: (projectId) => { calls.push(projectId); return projectId === projectA ? pendingA.promise : pendingB.promise; },
    get: async () => undefined,
    listChildren: async () => ({ parent: null, runs: [] }),
  });
  const { value, counters } = projection(client);

  const loadA = value.start(projectA);
  const loadB = value.start(projectB);
  pendingB.resolve({ runs: [run({ runId: creativeId, authorityRef: 'creative:b' })] });
  assert.equal(await loadB, true);
  assert.equal(value.snapshot().projectId, projectB);
  assert.equal(value.snapshot().runs[0].authorityRef, 'creative:b');

  pendingA.resolve({ runs: [run({ runId: creativeId, authorityRef: 'creative:a' })] });
  assert.equal(await loadA, false);
  assert.equal(value.snapshot().projectId, projectB);
  assert.equal(value.snapshot().runs[0].authorityRef, 'creative:b');
  assert.deepEqual(calls, [projectA, projectB]);
  assert.deepEqual(counters(), { scheduled: 2, cancelled: 1 });
});

test('transient refresh failure preserves the last confirmed server snapshot and marks it stale', async () => {
  let fail = false;
  const confirmed = run({ runId: creativeId, authorityRef: 'creative:last-good', status: 'SUCCEEDED', revision: 3, finishedAt: now });
  const client = Object.freeze({
    listRoots: async () => {
      if (fail) throw Object.assign(new Error('temporary outage'), { code: 'temporary_unavailable', status: 503 });
      return { runs: [confirmed] };
    },
    get: async () => undefined,
    listChildren: async () => ({ parent: null, runs: [] }),
  });
  const { value } = projection(client);

  assert.equal(await value.start(projectA), true);
  const accepted = value.snapshot();
  assert.equal(accepted.runs[0].runId, creativeId);
  fail = true;
  assert.equal(await value.refresh(), false);
  const stale = value.snapshot();
  assert.equal(stale.authoritative, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.runs[0].runId, creativeId);
  assert.equal(stale.error.code, 'temporary_unavailable');
  assert.equal(stale.error.status, 503);
  assert.equal(stale.lastRefreshedAt, accepted.lastRefreshedAt);
});

test('missing or invalid project scope stays non-authoritative and performs no recovery request', async () => {
  let calls = 0;
  const client = Object.freeze({
    listRoots: async () => { calls += 1; return { runs: [] }; },
    get: async () => undefined,
    listChildren: async () => ({ parent: null, runs: [] }),
  });
  const { value } = projection(client);

  assert.equal(await value.start(null), false);
  assert.equal(value.snapshot().authoritative, false);
  assert.equal(value.snapshot().projectId, null);
  assert.equal(await value.start('not-a-project'), false);
  assert.equal(value.snapshot().authoritative, false);
  assert.equal(value.snapshot().projectId, null);
  assert.equal(value.snapshot().error.code, 'invalid_project_id');
  assert.equal(calls, 0);
});

test('projection fails closed on unsupported future run semantics instead of silently reclassifying them', async () => {
  const client = Object.freeze({
    listRoots: async () => ({ runs: [run({ status: 'PAUSED' })] }),
    get: async () => undefined,
    listChildren: async () => ({ parent: null, runs: [] }),
  });
  const { value } = projection(client);

  assert.equal(await value.start(projectA), false);
  assert.equal(value.snapshot().authoritative, false);
  assert.equal(value.snapshot().runs.length, 0);
  assert.equal(value.snapshot().error.code, 'execution_run_recovery_unavailable');
});

test('projection accepts canonical QUEUED shape and rejects impossible lifecycle timestamp shapes', async () => {
  const cases = [
    { value: run({ status: 'QUEUED', startedAt: undefined }), accepted: true },
    { value: run({ status: 'QUEUED' }), accepted: false },
    { value: run({ status: 'RUNNING', startedAt: undefined }), accepted: false },
    { value: run({ status: 'SUCCEEDED' }), accepted: false },
  ];

  for (const item of cases) {
    const client = Object.freeze({
      listRoots: async () => ({ runs: [item.value] }),
      get: async () => undefined,
      listChildren: async () => ({ parent: null, runs: [] }),
    });
    const { value } = projection(client);
    assert.equal(await value.start(projectA), item.accepted);
    assert.equal(value.snapshot().authoritative, item.accepted);
  }
});
