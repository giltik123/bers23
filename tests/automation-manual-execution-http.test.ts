import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createAutomationManualExecutionHttpAdapter } from '../server/core/http/automationManualExecutionHttpAdapter.ts';

const automationId = '22222222-2222-4222-8222-222222222222';
const invocationId = '11111111-1111-4111-8111-111111111111';
const projectId = '33333333-3333-4333-8333-333333333333';
const terminalArtifactId = 'stored-final-artifact';

function waitingView() {
  return Object.freeze({
    invocationId,
    automationId,
    definitionRevision: 7,
    projectId,
    executionId: 'internal-agent-execution',
    revision: 3,
    state: 'WAITING_FOR_LOCAL_RESULT' as const,
    nextAction: Object.freeze({
      type: 'LOCAL_EXECUTION' as const,
      operation: 'ORTHOGONAL_TRANSFORM' as const,
      ticket: Object.freeze({ ticketId: 'ticket-1' }) as any,
    }),
  });
}

function successView() {
  return Object.freeze({
    ...waitingView(),
    revision: 6,
    state: 'SUCCESS' as const,
    nextAction: undefined,
    terminalArtifactId,
  });
}

function httpError(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, code });
}

test('C3b manual HTTP exposes invocation identity only, rejects browser authority widening and strips transport principal metadata', async () => {
  const calls: any[] = [];
  const execution = Object.freeze({
    start: async (command: any, scope: any) => {
      calls.push(['start', command, scope]);
      return waitingView();
    },
    resume: async (id: string, scope: any) => {
      calls.push(['resume', id, scope]);
      if (scope.userId !== 'user-a') throw httpError(404, 'automation_invocation_not_found', 'not found');
      return waitingView();
    },
    submitLocalResult: async (id: string, scope: any, result: any) => {
      calls.push(['result', id, scope, result]);
      return successView();
    },
    retry: async (id: string, scope: any) => {
      calls.push(['retry', id, scope]);
      return waitingView();
    },
    cancel: async (id: string, scope: any) => {
      calls.push(['cancel', id, scope]);
      return Object.freeze({ ...waitingView(), revision: 7, state: 'CANCELLED' as const, nextAction: undefined });
    },
  });
  const auth = Object.freeze({
    verify: async (authorization: string | undefined) => Object.freeze({
      tenantId: 'tenant-a',
      userId: authorization === 'Bearer user-b' ? 'user-b' : 'user-a',
      sessionId: 'transport-session-must-not-cross-domain-boundary',
      scopes: ['transport:metadata'],
    }) as any,
  });
  const previewCalls: any[] = [];
  const terminalPreview = Object.freeze({
    mint: async (scope: any, artifactId: string) => {
      previewCalls.push([scope, artifactId]);
      return `/api/core/artifacts/results/${artifactId}`;
    },
  });
  const config = Object.freeze({
    nodeEnv: 'test',
    allowedWebOrigins: Object.freeze(['http://client.test']),
    authChallengeSecret: 'automation-c3b-http-test-secret',
    authPublicOrigin: 'http://localhost',
    bodyLimitBytes: 64 * 1024,
  }) as any;
  const adapter = createAutomationManualExecutionHttpAdapter({ execution: execution as any, terminalPreview, auth, config, accepting: () => true });
  const server = createServer((request, response) => { void adapter(request, response); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not expose a TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, {
    ...init,
    headers: { authorization: 'Bearer user-a', ...(init.headers || {}) },
  });

  try {
    const preflight = await fetch(`${base}/api/core/automations/${automationId}/manual-runs`, {
      method: 'OPTIONS',
      headers: { origin: 'http://client.test' },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /X-Expected-Automation-Revision/);

    const missingRevision = await request(`/api/core/automations/${automationId}/manual-runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, clientRequestId: 'manual-1' }),
    });
    assert.equal(missingRevision.status, 400);

    const hostile = await request(`/api/core/automations/${automationId}/manual-runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-expected-automation-revision': '7' },
      body: JSON.stringify({
        projectId,
        clientRequestId: 'manual-hostile',
        sourceArtifactId: 'browser-source',
        mode: 'ROTATE_180',
        width: 12,
        provider: 'fal',
        executionId: 'browser-execution',
      }),
    });
    assert.equal(hostile.status, 400);
    assert.equal(calls.some(entry => entry[0] === 'start'), false);

    const startedResponse = await request(`/api/core/automations/${automationId}/manual-runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-expected-automation-revision': '7' },
      body: JSON.stringify({ projectId, clientRequestId: 'manual-1' }),
    });
    assert.equal(startedResponse.status, 202);
    const started = await startedResponse.json() as any;
    assert.equal(started.invocationId, invocationId);
    assert.equal(started.automationId, automationId);
    assert.equal(started.projectId, projectId);
    assert.equal(Object.hasOwn(started, 'executionId'), false, 'internal Agent executionId must not be browser authority');
    assert.equal(started.nextAction.ticket.ticketId, 'ticket-1');

    const startCall = calls.find(entry => entry[0] === 'start');
    assert.deepEqual(startCall[1], { automationId, definitionRevision: 7, projectId, clientRequestId: 'manual-1' });
    assert.deepEqual(startCall[2], { tenantId: 'tenant-a', userId: 'user-a' });
    assert.equal(Object.hasOwn(startCall[2], 'sessionId'), false);
    assert.equal(Object.hasOwn(startCall[2], 'scopes'), false);

    const queryWidening = await request(`/api/core/automation-invocations/${invocationId}?projectId=${projectId}`);
    assert.equal(queryWidening.status, 400);

    const resumed = await request(`/api/core/automation-invocations/${invocationId}`);
    assert.equal(resumed.status, 200);
    assert.equal(Object.hasOwn(await resumed.json() as any, 'executionId'), false);

    const foreign = await fetch(`${base}/api/core/automation-invocations/${invocationId}`, { headers: { authorization: 'Bearer user-b' } });
    assert.equal(foreign.status, 404);

    const hostileResult = await request(`/api/core/automation-invocations/${invocationId}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, executionId: 'browser-execution', result: { ticketId: 'ticket-1', status: 'SUCCESS' } }),
    });
    assert.equal(hostileResult.status, 400);

    const completedResponse = await request(`/api/core/automation-invocations/${invocationId}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ result: { ticketId: 'ticket-1', status: 'SUCCESS' } }),
    });
    assert.equal(completedResponse.status, 200);
    const completed = await completedResponse.json() as any;
    assert.equal(completed.state, 'SUCCESS');
    assert.equal(completed.terminalArtifactId, terminalArtifactId);
    assert.equal(completed.terminalImageUrl, `/api/core/artifacts/results/${terminalArtifactId}`);
    assert.equal(Object.hasOwn(completed, 'executionId'), false);
    assert.deepEqual(previewCalls, [[{ tenantId: 'tenant-a', userId: 'user-a', projectId }, terminalArtifactId]]);

    const retryWidening = await request(`/api/core/automation-invocations/${invocationId}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    assert.equal(retryWidening.status, 400);
    const retried = await request(`/api/core/automation-invocations/${invocationId}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(retried.status, 202);

    const cancelled = await request(`/api/core/automation-invocations/${invocationId}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json() as any).state, 'CANCELLED');

    const routed = calls.filter(entry => ['resume', 'result', 'retry', 'cancel'].includes(entry[0]));
    assert.ok(routed.some(entry => entry[0] === 'result' && entry[1] === invocationId));
    assert.ok(routed.some(entry => entry[0] === 'retry' && entry[1] === invocationId));
    assert.ok(routed.some(entry => entry[0] === 'cancel' && entry[1] === invocationId));
    for (const entry of routed.filter(entry => entry[0] !== 'resume' || entry[2]?.userId === 'user-a')) {
      const scope = entry[2];
      assert.deepEqual(scope, { tenantId: 'tenant-a', userId: 'user-a' });
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
