import assert from 'node:assert/strict';
import test from 'node:test';
import { BOUNDED_AGENT_PLAN_ID } from '../workflow/BoundedAgentDeterministicWorkflowService.ts';
import {
  BOUNDED_AGENT_AEE_EXECUTION,
  compileBoundedAgentAeeCompatibilityV1,
} from './BoundedAgentAeeCompatibilityCompilerV1.ts';
import { BoundedAgentAeeCompatibilityFacade } from './BoundedAgentAeeCompatibilityFacade.ts';
import { AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID } from './AeeSerialAdmittedGraphDriverV1.ts';

const auth = Object.freeze({ tenantId: 'tenant-ae4c2', userId: 'user-ae4c2' });
const scope = Object.freeze({ ...auth, projectId: 'project-ae4c2' });
const command = Object.freeze({
  clientRequestId: 'bounded-client-ae4c2',
  projectId: scope.projectId,
  sourceArtifactId: 'artifact-current-ae4c2',
  mode: 'ROTATE_90_CW',
  width: 320,
  height: 240,
});
const project = Object.freeze({
  projectId: scope.projectId,
  revision: 41,
  currentImageStorageId: 'storage-current-ae4c2',
  width: 640,
  height: 480,
});
const source = Object.freeze({
  artifactId: command.sourceArtifactId,
  storageId: project.currentImageStorageId,
  kind: 'image',
  role: 'ORIGINAL',
  sha256: 'a'.repeat(64),
  parentArtifactIds: Object.freeze([]),
  width: project.width,
  height: project.height,
});
const graph = compileBoundedAgentAeeCompatibilityV1(command, project, source);

function aeeView(overrides = {}) {
  return Object.freeze({
    executionId: 'aee-execution-ae4c2',
    revision: 2,
    state: 'WAITING_FOR_LOCAL_RESULT',
    graphDigest: graph.digest,
    nextAction: Object.freeze({
      type: 'LOCAL_EXECUTION',
      nodeId: 'bounded-orthogonal',
      operation: 'ORTHOGONAL_TRANSFORM',
      ticket: Object.freeze({ ticketId: 'ticket-ae4c2' }),
    }),
    ...overrides,
  });
}

function snapshot(planId, planDigest = graph.digest) {
  return Object.freeze({
    executionId: planId === BOUNDED_AGENT_PLAN_ID ? 'legacy-execution-ae4c2' : 'aee-execution-ae4c2',
    clientRequestId: command.clientRequestId,
    scope,
    plan: Object.freeze({ planId, planRevision: '1', planDigest }),
    inputArtifacts: Object.freeze([]),
    state: 'READY',
    completedSteps: Object.freeze([]),
    revision: 0,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  });
}

function runtime(overrides = {}) {
  const calls = [];
  const state = {
    byClient: undefined,
    byClientSequence: [],
    byExecution: undefined,
    projectReads: 0,
    projectBarriers: 0,
    puts: 0,
    aeeStarts: 0,
    legacyStarts: 0,
  };
  const dependencies = {
    continuations: {
      async getByClientRequestId(queryScope, clientRequestId) {
        calls.push('continuation-by-client');
        assert.deepEqual(queryScope, scope);
        assert.equal(clientRequestId, command.clientRequestId);
        return state.byClientSequence.length ? state.byClientSequence.shift() : state.byClient;
      },
      async get(executionId, queryScope) {
        calls.push('continuation-by-execution');
        assert.deepEqual(queryScope, scope);
        assert.equal(executionId, state.byExecution?.executionId);
        return state.byExecution;
      },
    },
    plans: {
      async put(queryScope, value) {
        calls.push('plan-put'); state.puts += 1;
        assert.deepEqual(queryScope, scope);
        assert.equal(value.digest, graph.digest);
        return Object.freeze({ scope: queryScope, graph: value, createdAt: '2026-09-10T00:00:00.000Z' });
      },
      async get(queryScope, digest) {
        calls.push('plan-get');
        assert.deepEqual(queryScope, scope);
        assert.equal(digest, graph.digest);
        return Object.freeze({ scope: queryScope, graph, createdAt: '2026-09-10T00:00:00.000Z' });
      },
    },
    aee: {
      async start(input, queryAuth) {
        calls.push('aee-start'); state.aeeStarts += 1;
        assert.deepEqual(queryAuth, auth);
        assert.equal(input.clientRequestId, command.clientRequestId);
        assert.equal(input.projectId, command.projectId);
        assert.equal(input.graphDigest, graph.digest);
        return aeeView();
      },
      async resume() { calls.push('aee-resume'); return aeeView({ state: 'READY', nextAction: undefined }); },
      async submitLocalResult() { calls.push('aee-result'); return aeeView(); },
      async retry() { calls.push('aee-retry'); return aeeView({ retryAvailable: true, attemptStatus: 'FAILED' }); },
      async cancel() { calls.push('aee-cancel'); return aeeView({ state: 'CANCELLED', nextAction: undefined, failureCode: 'WORKFLOW_CANCELLED' }); },
    },
    legacy: {
      async start() { calls.push('legacy-start'); state.legacyStarts += 1; return Object.freeze({ executionId: 'legacy-execution-ae4c2', revision: 3, state: 'READY' }); },
      async resume() { calls.push('legacy-resume'); return Object.freeze({ executionId: 'legacy-execution-ae4c2', revision: 3, state: 'READY' }); },
      async submitLocalResult() { calls.push('legacy-result'); return Object.freeze({ executionId: 'legacy-execution-ae4c2', revision: 4, state: 'READY' }); },
      async retry() { calls.push('legacy-retry'); return Object.freeze({ executionId: 'legacy-execution-ae4c2', revision: 4, state: 'WAITING_FOR_LOCAL_RESULT' }); },
      async cancel() { calls.push('legacy-cancel'); return Object.freeze({ executionId: 'legacy-execution-ae4c2', revision: 4, state: 'CANCELLED' }); },
    },
    projects: {
      async currentSourceContext(queryAuth, projectId) {
        calls.push('project-source'); state.projectReads += 1;
        assert.deepEqual(queryAuth, auth); assert.equal(projectId, command.projectId);
        return project;
      },
    },
    artifacts: {
      async resolve(queryScope, artifactId) {
        calls.push('artifact-resolve');
        assert.deepEqual(queryScope, scope); assert.equal(artifactId, command.sourceArtifactId);
        return source;
      },
    },
    admission: {
      async withClientRequestLock(queryScope, clientRequestId, work) {
        calls.push('admission-lock');
        assert.deepEqual(queryScope, scope); assert.equal(clientRequestId, command.clientRequestId);
        return work(Object.freeze({
          lockProjectForShare: async () => {
            calls.push('project-share-lock');
            state.projectBarriers += 1;
          },
        }));
      },
    },
    ...overrides,
  };
  return { facade: new BoundedAgentAeeCompatibilityFacade(dependencies), calls, state };
}

test('new bounded start is single-write AEE and takes Project barrier only after the second continuation lookup', async () => {
  const r = runtime();
  const view = await r.facade.start(command, auth);
  assert.deepEqual(r.calls, ['continuation-by-client', 'admission-lock', 'continuation-by-client', 'project-share-lock', 'project-source', 'artifact-resolve', 'plan-put', 'aee-start']);
  assert.equal(r.state.projectBarriers, 1);
  assert.equal(r.state.puts, 1);
  assert.equal(r.state.aeeStarts, 1);
  assert.equal(r.state.legacyStarts, 0);
  assert.equal(Object.hasOwn(view, 'graphDigest'), false);
  assert.equal(Object.hasOwn(view.nextAction, 'nodeId'), false);
  assert.equal(view.nextAction.operation, 'ORTHOGONAL_TRANSFORM');
  assert.deepEqual(graph.effectiveExecution, BOUNDED_AGENT_AEE_EXECUTION);
});

test('existing AEE clientRequestId replays immutable graph before any current Project admission barrier', async () => {
  const r = runtime();
  r.state.byClient = snapshot(AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID);
  const view = await r.facade.start(command, auth);
  assert.equal(view.executionId, 'aee-execution-ae4c2');
  assert.equal(r.state.projectReads, 0);
  assert.equal(r.state.projectBarriers, 0);
  assert.equal(r.state.puts, 0);
  assert.equal(r.state.aeeStarts, 1);
  assert.deepEqual(r.calls, ['continuation-by-client', 'plan-get', 'aee-start']);
  assert.equal(r.calls.includes('admission-lock'), false);
});

test('a raced first start replays after advisory serialization without touching current Project state', async () => {
  const r = runtime();
  r.state.byClientSequence.push(undefined, snapshot(AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID));
  const view = await r.facade.start(command, auth);
  assert.equal(view.executionId, 'aee-execution-ae4c2');
  assert.equal(r.state.projectReads, 0);
  assert.equal(r.state.projectBarriers, 0);
  assert.equal(r.state.puts, 0);
  assert.equal(r.state.aeeStarts, 1);
  assert.deepEqual(r.calls, ['continuation-by-client', 'admission-lock', 'continuation-by-client', 'plan-get', 'aee-start']);
});

test('existing AEE replay with changed command fails before graph persistence or AEE execution', async () => {
  const r = runtime();
  r.state.byClient = snapshot(AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID);
  await assert.rejects(
    () => r.facade.start({ ...command, width: command.width + 1 }, auth),
    error => error?.code === 'bounded_aee_replay_mismatch',
  );
  assert.equal(r.state.puts, 0);
  assert.equal(r.state.aeeStarts, 0);
  assert.equal(r.state.projectReads, 0);
  assert.equal(r.state.projectBarriers, 0);
  assert.equal(r.calls.includes('admission-lock'), false);
});

test('pre-cutover fixed-plan start remains legacy recovery-only and cannot create an AEE shadow graph', async () => {
  const r = runtime();
  r.state.byClient = snapshot(BOUNDED_AGENT_PLAN_ID, 'b'.repeat(64));
  const view = await r.facade.start(command, auth);
  assert.equal(view.executionId, 'legacy-execution-ae4c2');
  assert.equal(r.state.legacyStarts, 1);
  assert.equal(r.state.aeeStarts, 0);
  assert.equal(r.state.puts, 0);
  assert.equal(r.state.projectReads, 0);
  assert.equal(r.state.projectBarriers, 0);
  assert.equal(r.calls.includes('admission-lock'), false);
});

test('resume/result/retry/cancel route only from immutable continuation plan identity', async () => {
  const r = runtime();
  r.state.byExecution = snapshot(AEE_SERIAL_ADMITTED_GRAPH_PLAN_ID);
  await r.facade.resume(r.state.byExecution.executionId, scope.projectId, auth);
  await r.facade.submitLocalResult(r.state.byExecution.executionId, scope.projectId, auth, { ticketId: 'ticket-ae4c2' });
  await r.facade.retry(r.state.byExecution.executionId, scope.projectId, auth);
  await r.facade.cancel(r.state.byExecution.executionId, scope.projectId, auth);
  assert.deepEqual(r.calls.filter(call => call.startsWith('aee-')), ['aee-resume', 'aee-result', 'aee-retry', 'aee-cancel']);
  assert.equal(r.calls.some(call => call.startsWith('legacy-')), false);

  r.calls.length = 0;
  r.state.byExecution = snapshot(BOUNDED_AGENT_PLAN_ID, 'b'.repeat(64));
  await r.facade.resume(r.state.byExecution.executionId, scope.projectId, auth);
  await r.facade.cancel(r.state.byExecution.executionId, scope.projectId, auth);
  assert.deepEqual(r.calls.filter(call => call.startsWith('legacy-')), ['legacy-resume', 'legacy-cancel']);
  assert.equal(r.calls.some(call => call.startsWith('aee-')), false);
});

test('unknown durable plan identities fail closed without either execution delegate', async () => {
  const r = runtime();
  r.state.byClient = snapshot('unknown-agent-plan', 'c'.repeat(64));
  await assert.rejects(() => r.facade.start(command, auth), error => error?.code === 'bounded_agent_plan_unsupported');
  assert.equal(r.state.aeeStarts, 0);
  assert.equal(r.state.legacyStarts, 0);
  assert.equal(r.state.puts, 0);
  assert.equal(r.state.projectBarriers, 0);
  assert.equal(r.calls.includes('admission-lock'), false);
});
